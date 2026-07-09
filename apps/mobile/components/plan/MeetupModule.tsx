import { useCallback, useEffect, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, RefreshControl,
} from "react-native";
import { api } from "../../lib/api";
import { getSocket } from "../../lib/socket";
import { useAuthStore } from "../../hooks/useAuthStore";

type Member = {
  rsvp: string;
  role: string;
  meetupStatus?: string;
  user: { id: string; name: string | null };
};

const STATUSES = [
  { key: "home", emoji: "🏠", label: "Not left yet" },
  { key: "onway", emoji: "🚗", label: "On my way" },
  { key: "there", emoji: "✅", label: "I'm there" },
] as const;

function statusInfo(key: string | undefined) {
  return STATUSES.find((s) => s.key === key) ?? { key: "none", emoji: "⚪", label: "No status" };
}

export default function MeetupModule({ planId }: { planId: string }) {
  const { user } = useAuthStore();
  const [members, setMembers] = useState<Member[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/plans/${planId}`);
      setMembers(res.data.members ?? []);
    } catch { /* noop */ }
  }, [planId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const socket = getSocket();
    const refresh = () => load();
    socket.on("meetup:changed", refresh);
    return () => { socket.off("meetup:changed", refresh); };
  }, [load]);

  const myStatus = members.find((m) => m.user.id === user?.id)?.meetupStatus ?? "none";

  const setStatus = async (status: string) => {
    const next = myStatus === status ? "none" : status; // tap again to clear
    // optimistic
    setMembers((prev) =>
      prev.map((m) => (m.user.id === user?.id ? { ...m, meetupStatus: next } : m))
    );
    try {
      await api.post(`/plans/${planId}/meetup`, { status: next });
    } catch {
      await load();
    }
  };

  const there = members.filter((m) => m.meetupStatus === "there").length;
  const onway = members.filter((m) => m.meetupStatus === "onway").length;

  return (
    <ScrollView
      style={{ flex: 1, padding: 12 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor="#6366f1" />}
    >
      {/* My status */}
      <Text style={styles.sectionTitle}>Your status</Text>
      <View style={styles.statusRow}>
        {STATUSES.map((s) => (
          <TouchableOpacity
            key={s.key}
            style={[styles.statusBtn, myStatus === s.key && styles.statusBtnActive]}
            onPress={() => setStatus(s.key)}
          >
            <Text style={styles.statusEmoji}>{s.emoji}</Text>
            <Text style={[styles.statusLabel, myStatus === s.key && styles.statusLabelActive]}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Summary */}
      <View style={styles.summary}>
        <Text style={styles.summaryText}>
          ✅ {there} there · 🚗 {onway} on the way · {members.length} total
        </Text>
      </View>

      {/* Everyone */}
      <Text style={styles.sectionTitle}>Who's where</Text>
      {members.map((m) => {
        const info = statusInfo(m.meetupStatus);
        const isMe = m.user.id === user?.id;
        return (
          <View key={m.user.id} style={styles.memberRow}>
            <Text style={styles.memberEmoji}>{info.emoji}</Text>
            <Text style={styles.memberName}>{isMe ? "You" : m.user.name ?? "?"}</Text>
            <Text style={styles.memberStatus}>{info.label}</Text>
          </View>
        );
      })}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { color: "#94a3b8", fontSize: 14, fontWeight: "700", marginBottom: 10, marginTop: 8 },
  statusRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  statusBtn: {
    flex: 1, backgroundColor: "#1e293b", borderRadius: 16, padding: 14,
    alignItems: "center", borderWidth: 2, borderColor: "transparent",
  },
  statusBtnActive: { borderColor: "#6366f1", backgroundColor: "#312e81" },
  statusEmoji: { fontSize: 26, marginBottom: 6 },
  statusLabel: { color: "#94a3b8", fontSize: 12, fontWeight: "600", textAlign: "center" },
  statusLabelActive: { color: "#ffffff" },
  summary: { backgroundColor: "#1e293b", borderRadius: 14, padding: 14, alignItems: "center", marginBottom: 16 },
  summaryText: { color: "#e2e8f0", fontSize: 14, fontWeight: "600" },
  memberRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#1e293b", borderRadius: 14, padding: 14, marginBottom: 8 },
  memberEmoji: { fontSize: 20, marginRight: 12 },
  memberName: { color: "#ffffff", fontSize: 15, fontWeight: "600", flex: 1 },
  memberStatus: { color: "#64748b", fontSize: 13 },
});
