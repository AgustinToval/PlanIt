import { useCallback, useEffect, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  Alert, RefreshControl, Modal,
} from "react-native";
import { api } from "../../lib/api";
import { getSocket } from "../../lib/socket";
import { useAuthStore } from "../../hooks/useAuthStore";

type Vote = {
  id: string;
  question: string;
  options: string[];
  results: Record<string, number>;
  closed: boolean;
  createdAt: string;
};

export default function VotesModule({
  planId, myRole = "member",
}: { planId: string; myRole?: string }) {
  const { user } = useAuthStore();
  const [votes, setVotes] = useState<Vote[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [busy, setBusy] = useState(false);

  const canManage = myRole === "admin" || myRole === "helper";

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/plans/${planId}`);
      const list: Vote[] = (res.data.votes ?? []).map((v: any) => ({
        ...v,
        options: v.options as string[],
        results: (v.results ?? {}) as Record<string, number>,
      }));
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setVotes(list);
    } catch { /* noop */ }
  }, [planId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const socket = getSocket();
    const refresh = () => load();
    socket.on("votes:changed", refresh);
    return () => { socket.off("votes:changed", refresh); };
  }, [load]);

  const createVote = async () => {
    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || cleanOptions.length < 2) return;
    setBusy(true);
    try {
      await api.post(`/votes/plan/${planId}`, { question: question.trim(), options: cleanOptions });
      setQuestion("");
      setOptions(["", ""]);
      setShowCreate(false);
      await load();
    } catch {
      Alert.alert("Error", "Could not create the vote");
    } finally {
      setBusy(false);
    }
  };

  const cast = async (vote: Vote, option: number) => {
    if (vote.closed) return;
    // optimistic
    setVotes((prev) =>
      prev.map((v) => (v.id === vote.id ? { ...v, results: { ...v.results, [user!.id]: option } } : v))
    );
    try {
      await api.post(`/votes/${vote.id}/cast`, { option });
    } catch {
      await load();
    }
  };

  const closeVote = (vote: Vote) => {
    if (!canManage) return;
    Alert.alert("Close vote?", "No more votes will be accepted.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Close", onPress: async () => {
          try { await api.post(`/votes/${vote.id}/close`); await load(); } catch { /* noop */ }
        },
      },
    ]);
  };

  const deleteVote = (vote: Vote) => {
    if (!canManage) return;
    Alert.alert("Delete vote?", vote.question, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          try { await api.delete(`/votes/${vote.id}`); await load(); } catch { /* noop */ }
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1, padding: 12 }}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor="#6366f1" />}
      >
        {votes.length === 0 && (
          <Text style={styles.empty}>No votes yet — settle a debate! 🗳️</Text>
        )}
        {votes.map((vote) => {
          const totalVotes = Object.keys(vote.results).length;
          const myChoice = user ? vote.results[user.id] : undefined;
          const counts = vote.options.map(
            (_, i) => Object.values(vote.results).filter((r) => r === i).length
          );
          const maxCount = Math.max(...counts, 1);
          return (
            <TouchableOpacity
              key={vote.id}
              style={styles.voteCard}
              onLongPress={() => (vote.closed ? deleteVote(vote) : closeVote(vote))}
              activeOpacity={1}
            >
              <View style={styles.voteHeader}>
                <Text style={styles.question}>{vote.question}</Text>
                {vote.closed && <Text style={styles.closedBadge}>Closed</Text>}
              </View>
              <Text style={styles.voteMeta}>
                {totalVotes} vote{totalVotes !== 1 ? "s" : ""}
                {myChoice === undefined && !vote.closed ? " · you haven't voted" : ""}
              </Text>

              {vote.options.map((opt, i) => {
                const count = counts[i] ?? 0;
                const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                const isMine = myChoice === i;
                const isWinner = vote.closed && count === maxCount && count > 0;
                return (
                  <TouchableOpacity
                    key={i}
                    style={[styles.option, isMine && styles.optionMine, isWinner && styles.optionWinner]}
                    onPress={() => cast(vote, i)}
                    disabled={vote.closed}
                  >
                    <View style={[styles.optionFill, { width: `${totalVotes ? (count / totalVotes) * 100 : 0}%` }]} />
                    <View style={styles.optionContent}>
                      <Text style={styles.optionText}>
                        {isWinner ? "🏆 " : ""}{opt}{isMine ? "  ✓" : ""}
                      </Text>
                      <Text style={styles.optionCount}>{count} · {pct}%</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}

              {canManage && (
                <Text style={styles.manageHint}>
                  {vote.closed ? "Long-press to delete" : "Long-press to close voting"}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
        <View style={{ height: 90 }} />
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => setShowCreate(true)}>
        <Text style={styles.fabText}>＋ New vote</Text>
      </TouchableOpacity>

      {/* Create vote modal */}
      <Modal visible={showCreate} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New vote</Text>
              <TouchableOpacity onPress={() => setShowCreate(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Question</Text>
            <TextInput
              style={styles.input}
              placeholder="Where do we eat?"
              placeholderTextColor="#475569"
              value={question}
              onChangeText={setQuestion}
            />

            <Text style={styles.label}>Options</Text>
            {options.map((opt, i) => (
              <View key={i} style={styles.optionInputRow}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  placeholder={`Option ${i + 1}`}
                  placeholderTextColor="#475569"
                  value={opt}
                  onChangeText={(t) => setOptions((prev) => prev.map((o, j) => (j === i ? t : o)))}
                />
                {options.length > 2 && (
                  <TouchableOpacity
                    style={styles.removeOptBtn}
                    onPress={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <Text style={{ color: "#94a3b8" }}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
            {options.length < 6 && (
              <TouchableOpacity onPress={() => setOptions((prev) => [...prev, ""])}>
                <Text style={styles.addOption}>＋ Add option</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[
                styles.button,
                (busy || !question.trim() || options.filter((o) => o.trim()).length < 2) && { opacity: 0.5 },
              ]}
              onPress={createVote}
              disabled={busy || !question.trim() || options.filter((o) => o.trim()).length < 2}
            >
              <Text style={styles.buttonText}>{busy ? "..." : "Create vote"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { color: "#475569", textAlign: "center", marginTop: 40, fontSize: 14 },
  voteCard: { backgroundColor: "#1e293b", borderRadius: 16, padding: 16, marginBottom: 12 },
  voteHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  question: { color: "#ffffff", fontSize: 17, fontWeight: "700", flex: 1 },
  closedBadge: { color: "#f87171", fontSize: 12, fontWeight: "700", backgroundColor: "#450a0a", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  voteMeta: { color: "#64748b", fontSize: 12, marginTop: 4, marginBottom: 12 },
  option: { borderRadius: 12, backgroundColor: "#0f172a", marginBottom: 8, overflow: "hidden", borderWidth: 2, borderColor: "transparent" },
  optionMine: { borderColor: "#6366f1" },
  optionWinner: { borderColor: "#22c55e" },
  optionFill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: "#312e81", opacity: 0.55 },
  optionContent: { flexDirection: "row", justifyContent: "space-between", padding: 12 },
  optionText: { color: "#e2e8f0", fontSize: 14, fontWeight: "600", flex: 1 },
  optionCount: { color: "#94a3b8", fontSize: 13, fontWeight: "700" },
  manageHint: { color: "#475569", fontSize: 11, textAlign: "center", marginTop: 4 },
  fab: { position: "absolute", bottom: 20, right: 16, left: 16, backgroundColor: "#6366f1", borderRadius: 16, padding: 16, alignItems: "center" },
  fabText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modal: { backgroundColor: "#0f172a", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { color: "#ffffff", fontSize: 20, fontWeight: "800" },
  modalClose: { color: "#64748b", fontSize: 20 },
  label: { color: "#cbd5e1", fontSize: 14, fontWeight: "600", marginBottom: 8 },
  input: { backgroundColor: "#1e293b", borderRadius: 14, padding: 14, color: "#ffffff", fontSize: 15, marginBottom: 12, borderWidth: 1, borderColor: "#334155" },
  optionInputRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  removeOptBtn: { padding: 10 },
  addOption: { color: "#818cf8", fontSize: 14, fontWeight: "600", marginBottom: 12 },
  button: { backgroundColor: "#6366f1", borderRadius: 16, padding: 16, alignItems: "center", marginTop: 8 },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
});
