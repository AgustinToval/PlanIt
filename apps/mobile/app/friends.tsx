import { useCallback, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  Alert, RefreshControl, Modal,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { api } from "../lib/api";

type Friend = { id: string; name: string | null; username: string | null; avatar: string | null };
type FriendRequest = { id: string; createdAt: string; from: Friend };
type Profile = {
  id: string; name: string | null; username: string | null; email: string;
  bio: string | null; location: string | null; createdAt: string;
  _count: { planMembers: number; groupMembers: number; photos: number };
};

export default function FriendsScreen() {
  const router = useRouter();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);

  const load = async () => {
    try {
      const [f, r] = await Promise.all([
        api.get("/friends"),
        api.get("/friends/requests"),
      ]);
      setFriends(f.data);
      setRequests(r.data);
    } catch { /* noop */ }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const addFriend = async () => {
    const q = query.trim();
    if (!q) return;
    setBusy(true);
    try {
      const res = await api.post("/friends", { query: q });
      setQuery("");
      await load();
      if (res.data.autoAccepted) {
        Alert.alert("✅ You're now friends", `${res.data.name} had already sent you a request`);
      } else {
        Alert.alert("📨 Request sent", `Waiting for ${res.data.name ?? q} to accept`);
      }
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.error ?? "Could not send request");
    } finally {
      setBusy(false);
    }
  };

  const respond = async (r: FriendRequest, action: "accept" | "decline") => {
    try {
      await api.post(`/friends/requests/${r.id}/${action}`);
      await load();
    } catch { /* noop */ }
  };

  const openProfile = async (f: Friend) => {
    try {
      const res = await api.get(`/friends/${f.id}/profile`);
      setProfile(res.data);
    } catch {
      Alert.alert("Error", "Could not load profile");
    }
  };

  const removeFriend = (f: Friend) => {
    Alert.alert("Remove friend?", f.name ?? "This user", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/friends/${f.id}`);
            await load();
          } catch { /* noop */ }
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={styles.container}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor="#6366f1" />}
    >
      <TouchableOpacity onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>‹ Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Friends</Text>

      <Text style={styles.label}>Add a friend</Text>
      <View style={styles.addRow}>
        <TextInput
          style={[styles.input, { flex: 1, marginBottom: 0 }]}
          placeholder="Their email or username"
          placeholderTextColor="#475569"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          onSubmitEditing={addFriend}
          returnKeyType="done"
        />
        <TouchableOpacity
          style={[styles.addBtn, (!query.trim() || busy) && { opacity: 0.5 }]}
          onPress={addFriend}
          disabled={!query.trim() || busy}
        >
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>

      {/* Incoming requests */}
      {requests.length > 0 && (
        <>
          <Text style={[styles.label, { marginTop: 24 }]}>
            📨 Friend requests ({requests.length})
          </Text>
          {requests.map((r) => (
            <View key={r.id} style={[styles.friendRow, styles.requestRow]}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{(r.from.name ?? "?")[0]?.toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.friendName}>{r.from.name ?? "?"}</Text>
                {r.from.username && <Text style={styles.friendMeta}>@{r.from.username}</Text>}
              </View>
              <TouchableOpacity style={styles.acceptBtn} onPress={() => respond(r, "accept")}>
                <Text style={styles.acceptText}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.declineBtn} onPress={() => respond(r, "decline")}>
                <Text style={styles.declineText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </>
      )}

      <Text style={[styles.label, { marginTop: 24 }]}>
        Your friends ({friends.length})
      </Text>
      {friends.length === 0 ? (
        <Text style={styles.empty}>
          No friends yet — send a request by email or username. They need a PlanIt account first.
        </Text>
      ) : (
        friends.map((f) => (
          <TouchableOpacity
            key={f.id}
            style={styles.friendRow}
            onPress={() => openProfile(f)}
            onLongPress={() => removeFriend(f)}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(f.name ?? "?")[0]?.toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.friendName}>{f.name ?? "?"}</Text>
              {f.username && <Text style={styles.friendMeta}>@{f.username}</Text>}
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        ))
      )}
      <Text style={styles.hint}>Tap to see profile · long-press to remove</Text>

      {/* Friend profile modal */}
      <Modal visible={profile !== null} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Profile</Text>
              <TouchableOpacity onPress={() => setProfile(null)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {profile && (
              <>
                <View style={styles.profileTop}>
                  <View style={styles.bigAvatar}>
                    <Text style={styles.bigAvatarText}>{(profile.name ?? "?")[0]?.toUpperCase()}</Text>
                  </View>
                  <Text style={styles.profileName}>{profile.name ?? "?"}</Text>
                  {profile.username && <Text style={styles.profileUsername}>@{profile.username}</Text>}
                </View>

                <View style={styles.infoBox}>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>📧 Email</Text>
                    <Text style={styles.infoValue}>{profile.email}</Text>
                  </View>
                  {profile.location && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>📍 Location</Text>
                      <Text style={styles.infoValue}>{profile.location}</Text>
                    </View>
                  )}
                  {profile.bio && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>💬 Bio</Text>
                      <Text style={styles.infoValue}>{profile.bio}</Text>
                    </View>
                  )}
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>📅 Joined</Text>
                    <Text style={styles.infoValue}>
                      {new Date(profile.createdAt).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
                    </Text>
                  </View>
                </View>

                <View style={styles.statsRow}>
                  <View style={styles.stat}>
                    <Text style={styles.statNum}>{profile._count.planMembers}</Text>
                    <Text style={styles.statLabel}>Plans</Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={styles.statNum}>{profile._count.groupMembers}</Text>
                    <Text style={styles.statLabel}>Groups</Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={styles.statNum}>{profile._count.photos}</Text>
                    <Text style={styles.statLabel}>Photos</Text>
                  </View>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a", padding: 24, paddingTop: 60 },
  back: { marginBottom: 16 },
  backText: { color: "#6366f1", fontSize: 17 },
  title: { fontSize: 28, fontWeight: "800", color: "#ffffff", marginBottom: 20 },
  label: { color: "#cbd5e1", fontSize: 14, fontWeight: "600", marginBottom: 8 },
  addRow: { flexDirection: "row", gap: 8 },
  input: {
    backgroundColor: "#1e293b", borderRadius: 14, padding: 14, color: "#ffffff",
    fontSize: 15, borderWidth: 1, borderColor: "#334155",
  },
  addBtn: { backgroundColor: "#6366f1", borderRadius: 14, paddingHorizontal: 20, justifyContent: "center" },
  addBtnText: { color: "#ffffff", fontWeight: "700", fontSize: 15 },
  empty: { color: "#64748b", fontSize: 14, lineHeight: 20 },
  friendRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#1e293b", borderRadius: 14, padding: 12, marginBottom: 8 },
  requestRow: { borderWidth: 1, borderColor: "#6366f1" },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#6366f1", alignItems: "center", justifyContent: "center", marginRight: 12 },
  avatarText: { color: "#ffffff", fontWeight: "800", fontSize: 17 },
  friendName: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
  friendMeta: { color: "#64748b", fontSize: 13 },
  chevron: { color: "#475569", fontSize: 20 },
  acceptBtn: { backgroundColor: "#6366f1", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginRight: 6 },
  acceptText: { color: "#ffffff", fontSize: 13, fontWeight: "700" },
  declineBtn: { backgroundColor: "#1e293b", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: "#475569" },
  declineText: { color: "#94a3b8", fontSize: 13, fontWeight: "700" },
  hint: { color: "#475569", fontSize: 12, textAlign: "center", marginTop: 16, marginBottom: 40 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modal: { backgroundColor: "#0f172a", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { color: "#ffffff", fontSize: 20, fontWeight: "800" },
  modalClose: { color: "#64748b", fontSize: 20 },
  profileTop: { alignItems: "center", marginBottom: 20 },
  bigAvatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: "#6366f1", alignItems: "center", justifyContent: "center", marginBottom: 10 },
  bigAvatarText: { color: "#ffffff", fontSize: 32, fontWeight: "800" },
  profileName: { color: "#ffffff", fontSize: 22, fontWeight: "800" },
  profileUsername: { color: "#818cf8", fontSize: 15, marginTop: 2 },
  infoBox: { backgroundColor: "#1e293b", borderRadius: 16, padding: 16, marginBottom: 16 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
  infoLabel: { color: "#94a3b8", fontSize: 14 },
  infoValue: { color: "#ffffff", fontSize: 14, fontWeight: "600", flexShrink: 1, textAlign: "right" },
  statsRow: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, backgroundColor: "#1e293b", borderRadius: 16, padding: 14, alignItems: "center" },
  statNum: { color: "#ffffff", fontSize: 22, fontWeight: "800" },
  statLabel: { color: "#64748b", fontSize: 12, marginTop: 2 },
});
