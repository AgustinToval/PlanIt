import { useCallback, useEffect, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  Alert, RefreshControl, Modal, KeyboardAvoidingView, Platform,
  Keyboard, TouchableWithoutFeedback,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../lib/api";
import { getSocket } from "../../lib/socket";
import { useAuthStore } from "../../hooks/useAuthStore";
import { font, radius, shadow, Palette, themedStyles } from "../../lib/theme";
import { useTheme, useT } from "../../hooks/useSettings";

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
  const c = useTheme();
  const styles = getStyles(c);
  const t = useT();
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
    Alert.alert(t("vo.closeQ"), t("vo.closeMsg"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.close"), onPress: async () => {
          try { await api.post(`/votes/${vote.id}/close`); await load(); } catch { /* noop */ }
        },
      },
    ]);
  };

  const deleteVote = (vote: Vote) => {
    if (!canManage) return;
    Alert.alert(t("vo.deleteQ"), vote.question, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"), style: "destructive",
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={c.orange} />}
      >
        {votes.length === 0 && (
          <Text style={styles.empty}>{t("vo.empty")}</Text>
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
                {vote.closed && <Text style={styles.closedBadge}>{t("vo.closed")}</Text>}
              </View>
              <Text style={styles.voteMeta}>
                {totalVotes} {t("vo.votes")}
                {myChoice === undefined && !vote.closed ? ` · ${t("vo.notVoted")}` : ""}
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
                      <View style={styles.optionTextRow}>
                        {isWinner && <Ionicons name="trophy" size={13} color={c.orange} />}
                        <Text style={styles.optionText}>{opt}</Text>
                        {isMine && <Ionicons name="checkmark-circle" size={14} color={c.teal} />}
                      </View>
                      <Text style={styles.optionCount}>{count} · {pct}%</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}

              {canManage && (
                <Text style={styles.manageHint}>
                  {vote.closed ? t("vo.longDel") : t("vo.longClose")}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
        <View style={{ height: 90 }} />
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => setShowCreate(true)}>
        <View style={styles.fabRow}>
          <Ionicons name="add" size={18} color={c.onOrange} />
          <Text style={styles.fabText}>{t("vo.new")}</Text>
        </View>
      </TouchableOpacity>

      {/* Create vote modal */}
      <Modal visible={showCreate} animationType="slide" transparent>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t("vo.new")}</Text>
              <TouchableOpacity onPress={() => setShowCreate(false)}>
                <Ionicons name="close" size={22} color={c.muted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>{t("vo.q")}</Text>
            <TextInput
              style={styles.input}
              placeholder={t("vo.qPh")}
              placeholderTextColor={c.faint}
              value={question}
              onChangeText={setQuestion}
            />

            <Text style={styles.label}>{t("vo.options")}</Text>
            {options.map((opt, i) => (
              <View key={i} style={styles.optionInputRow}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  placeholder={`${t("vo.option")} ${i + 1}`}
                  placeholderTextColor={c.faint}
                  value={opt}
                  onChangeText={(t) => setOptions((prev) => prev.map((o, j) => (j === i ? t : o)))}
                />
                {options.length > 2 && (
                  <TouchableOpacity
                    style={styles.removeOptBtn}
                    onPress={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <Ionicons name="close" size={17} color={c.muted} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
            {options.length < 6 && (
              <TouchableOpacity onPress={() => setOptions((prev) => [...prev, ""])}>
                <Text style={styles.addOption}>{t("vo.addOpt")}</Text>
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
              <Text style={styles.buttonText}>{busy ? "..." : t("vo.create")}</Text>
            </TouchableOpacity>
          </View>
          </TouchableWithoutFeedback>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const getStyles = themedStyles((c: Palette) => StyleSheet.create({
  empty: { color: c.faint, textAlign: "center", marginTop: 40, fontSize: 13.5, fontFamily: font.body },
  voteCard: {
    backgroundColor: c.surface, borderRadius: radius.lg, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: c.line, ...shadow.card,
  },
  voteHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  question: { color: c.ink, fontSize: 16, fontFamily: font.semi, flex: 1, letterSpacing: -0.2 },
  closedBadge: {
    color: c.danger, fontSize: 11, fontFamily: font.semi,
    backgroundColor: c.dangerSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill,
  },
  voteMeta: { color: c.muted, fontSize: 12, fontFamily: font.bodyMedium, marginTop: 4, marginBottom: 12 },
  option: {
    borderRadius: radius.md, backgroundColor: c.surface2, marginBottom: 8,
    overflow: "hidden", borderWidth: 1.5, borderColor: c.line,
  },
  optionMine: { borderColor: c.orange },
  optionWinner: { borderColor: c.teal },
  optionFill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: c.tealSoft },
  optionContent: { flexDirection: "row", justifyContent: "space-between", padding: 12 },
  optionTextRow: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  optionText: { color: c.ink, fontSize: 13.5, fontFamily: font.bodySemi, flexShrink: 1 },
  optionCount: { color: c.muted, fontSize: 12.5, fontFamily: font.bodyBold },
  manageHint: { color: c.faint, fontSize: 11, fontFamily: font.body, textAlign: "center", marginTop: 4 },
  fab: {
    position: "absolute", bottom: 20, right: 16, left: 16, backgroundColor: c.orange,
    borderRadius: radius.lg, padding: 16, alignItems: "center", ...shadow.orange,
  },
  fabRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  fabText: { color: c.onOrange, fontSize: 15, fontFamily: font.semi },
  modalOverlay: { flex: 1, backgroundColor: "rgba(7,32,48,0.55)", justifyContent: "flex-end" },
  modal: {
    backgroundColor: c.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 40,
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { color: c.ink, fontSize: 19, fontFamily: font.title },
  label: { color: c.ink, fontSize: 13, fontFamily: font.bodySemi, marginBottom: 8 },
  input: {
    backgroundColor: c.surface, borderRadius: radius.md, padding: 14, color: c.ink,
    fontSize: 14.5, fontFamily: font.bodyMedium, marginBottom: 12, borderWidth: 1, borderColor: c.line,
  },
  optionInputRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  removeOptBtn: { padding: 10 },
  addOption: { color: c.teal, fontSize: 13.5, fontFamily: font.bodySemi, marginBottom: 12 },
  button: {
    backgroundColor: c.orange, borderRadius: radius.lg, padding: 16,
    alignItems: "center", marginTop: 8, ...shadow.orange,
  },
  buttonText: { color: c.onOrange, fontSize: 15, fontFamily: font.semi },
}));
