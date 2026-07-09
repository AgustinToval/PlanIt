import { useCallback, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, RefreshControl,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { api } from "../lib/api";

type FriendReq = { id: string; from: { id: string; name: string | null; username: string | null } };
type GroupInvite = { id: string; group: { id: string; name: string }; invitedBy: string; memberCount: number };
type PlanInvite = {
  id: string;
  plan: { id: string; title: string; type: string; startDate: string | null; location: string | null };
  invitedBy: string; memberCount: number;
};

export default function NotificationsScreen() {
  const router = useRouter();
  const [friendReqs, setFriendReqs] = useState<FriendReq[]>([]);
  const [groupInvites, setGroupInvites] = useState<GroupInvite[]>([]);
  const [planInvites, setPlanInvites] = useState<PlanInvite[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const [fr, gi, pi] = await Promise.all([
        api.get("/friends/requests"),
        api.get("/groups/invitations/mine"),
        api.get("/plans/invitations/mine"),
      ]);
      setFriendReqs(fr.data);
      setGroupInvites(gi.data);
      setPlanInvites(pi.data);
    } catch { /* noop */ }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const total = friendReqs.length + groupInvites.length + planInvites.length;

  const respondFriend = async (id: string, action: "accept" | "decline") => {
    try { await api.post(`/friends/requests/${id}/${action}`); await load(); } catch { /* noop */ }
  };
  const respondGroup = async (id: string, action: "accept" | "decline") => {
    try { await api.post(`/groups/invitations/${id}/${action}`); await load(); } catch { /* noop */ }
  };
  const respondPlan = async (id: string, action: "accept" | "decline") => {
    try { await api.post(`/plans/invitations/${id}/${action}`); await load(); } catch { /* noop */ }
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor="#6366f1" />}
    >
      <TouchableOpacity onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>‹ Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Notifications</Text>

      {total === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🔔</Text>
          <Text style={styles.emptyText}>You're all caught up</Text>
          <Text style={styles.emptySub}>Friend requests and invitations will show up here</Text>
        </View>
      )}

      {/* Plan invites */}
      {planInvites.length > 0 && <Text style={styles.section}>🗓️ Plan invitations</Text>}
      {planInvites.map((inv) => (
        <View key={inv.id} style={styles.card}>
          <Text style={styles.cardTitle}>
            {inv.plan.type === "quick" ? "⚡ " : ""}{inv.plan.title}
          </Text>
          <Text style={styles.cardMeta}>
            {inv.invitedBy} invited you · {inv.memberCount} going
            {inv.plan.location ? ` · 📍 ${inv.plan.location}` : ""}
          </Text>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.accept} onPress={() => respondPlan(inv.id, "accept")}>
              <Text style={styles.acceptText}>Join</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.decline} onPress={() => respondPlan(inv.id, "decline")}>
              <Text style={styles.declineText}>Decline</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      {/* Group invites */}
      {groupInvites.length > 0 && <Text style={styles.section}>👥 Group invitations</Text>}
      {groupInvites.map((inv) => (
        <View key={inv.id} style={styles.card}>
          <Text style={styles.cardTitle}>{inv.group.name}</Text>
          <Text style={styles.cardMeta}>{inv.invitedBy} invited you · {inv.memberCount} members</Text>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.accept} onPress={() => respondGroup(inv.id, "accept")}>
              <Text style={styles.acceptText}>Join</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.decline} onPress={() => respondGroup(inv.id, "decline")}>
              <Text style={styles.declineText}>Decline</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      {/* Friend requests */}
      {friendReqs.length > 0 && <Text style={styles.section}>🤝 Friend requests</Text>}
      {friendReqs.map((r) => (
        <View key={r.id} style={styles.card}>
          <Text style={styles.cardTitle}>{r.from.name ?? "?"}</Text>
          {r.from.username && <Text style={styles.cardMeta}>@{r.from.username}</Text>}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.accept} onPress={() => respondFriend(r.id, "accept")}>
              <Text style={styles.acceptText}>Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.decline} onPress={() => respondFriend(r.id, "decline")}>
              <Text style={styles.declineText}>Decline</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a", padding: 24, paddingTop: 60 },
  back: { marginBottom: 16 },
  backText: { color: "#6366f1", fontSize: 17 },
  title: { fontSize: 28, fontWeight: "800", color: "#ffffff", marginBottom: 20 },
  empty: { alignItems: "center", marginTop: 80 },
  emptyIcon: { fontSize: 56 },
  emptyText: { color: "#ffffff", fontSize: 20, fontWeight: "700", marginTop: 16 },
  emptySub: { color: "#64748b", fontSize: 14, marginTop: 8, textAlign: "center", paddingHorizontal: 40 },
  section: { color: "#94a3b8", fontSize: 14, fontWeight: "700", marginTop: 20, marginBottom: 10 },
  card: { backgroundColor: "#1e293b", borderRadius: 16, padding: 16, marginBottom: 10 },
  cardTitle: { color: "#ffffff", fontSize: 17, fontWeight: "700" },
  cardMeta: { color: "#64748b", fontSize: 13, marginTop: 3 },
  actions: { flexDirection: "row", gap: 10, marginTop: 12 },
  accept: { flex: 1, backgroundColor: "#6366f1", borderRadius: 12, padding: 12, alignItems: "center" },
  acceptText: { color: "#ffffff", fontWeight: "700", fontSize: 15 },
  decline: { flex: 1, backgroundColor: "#1e293b", borderWidth: 1, borderColor: "#475569", borderRadius: 12, padding: 12, alignItems: "center" },
  declineText: { color: "#94a3b8", fontWeight: "700", fontSize: 15 },
});
