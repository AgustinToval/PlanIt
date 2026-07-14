import { useCallback, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  Alert, RefreshControl, Modal,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
import { colors, font, radius, shadow, userColor } from "../lib/theme";

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
        Alert.alert("You're now friends", `${res.data.name} had already sent you a request`);
      } else {
        Alert.alert("Request sent", `Waiting for ${res.data.name ?? q} to accept`);
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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.orange} />}
    >
      <TouchableOpacity onPress={() => router.back()} style={styles.back}>
        <Ionicons name="chevron-back" size={18} color={colors.teal} />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Friends</Text>

      <Text style={styles.label}>Add a friend</Text>
      <View style={styles.addRow}>
        <View style={[styles.inputWrap, { flex: 1 }]}>
          <Ionicons name="search" size={16} color={colors.faint} />
          <TextInput
            style={styles.input}
            placeholder="Their email or username"
            placeholderTextColor={colors.faint}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            onSubmitEditing={addFriend}
            returnKeyType="done"
          />
        </View>
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
            Friend requests ({requests.length})
          </Text>
          {requests.map((r) => (
            <View key={r.id} style={[styles.friendRow, styles.requestRow]}>
              <View style={[styles.avatar, { backgroundColor: userColor(r.from.id) }]}>
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
                <Ionicons name="close" size={15} color={colors.muted} />
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
            <View style={[styles.avatar, { backgroundColor: userColor(f.id) }]}>
              <Text style={styles.avatarText}>{(f.name ?? "?")[0]?.toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.friendName}>{f.name ?? "?"}</Text>
              {f.username && <Text style={styles.friendMeta}>@{f.username}</Text>}
            </View>
            <Ionicons name="chevron-forward" size={17} color={colors.faint} />
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
                <Ionicons name="close" size={22} color={colors.muted} />
              </TouchableOpacity>
            </View>

            {profile && (
              <>
                <View style={styles.profileTop}>
                  <View style={[styles.bigAvatar, { backgroundColor: userColor(profile.id) }]}>
                    <Text style={styles.bigAvatarText}>{(profile.name ?? "?")[0]?.toUpperCase()}</Text>
                  </View>
                  <Text style={styles.profileName}>{profile.name ?? "?"}</Text>
                  {profile.username && <Text style={styles.profileUsername}>@{profile.username}</Text>}
                  {profile.bio && <Text style={styles.profileBio}>{profile.bio}</Text>}
                </View>

                <View style={styles.infoBox}>
                  {profile.location && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Location</Text>
                      <Text style={styles.infoValue}>{profile.location}</Text>
                    </View>
                  )}
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Joined</Text>
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
  container: { flex: 1, backgroundColor: colors.bg, padding: 20, paddingTop: 60 },
  back: { flexDirection: "row", alignItems: "center", gap: 2, marginBottom: 16 },
  backText: { color: colors.teal, fontSize: 15, fontFamily: font.bodySemi },
  title: { fontSize: 25, fontFamily: font.title, color: colors.ink, letterSpacing: -0.5, marginBottom: 20 },
  label: { color: colors.ink, fontSize: 13, fontFamily: font.bodySemi, marginBottom: 8 },
  addRow: { flexDirection: "row", gap: 8 },
  inputWrap: {
    flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface,
    borderRadius: radius.md, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.line,
  },
  input: { flex: 1, paddingVertical: 13, color: colors.ink, fontSize: 14.5, fontFamily: font.bodyMedium },
  addBtn: {
    backgroundColor: colors.orange, borderRadius: radius.md, paddingHorizontal: 20,
    justifyContent: "center", ...shadow.orange,
  },
  addBtnText: { color: colors.onOrange, fontFamily: font.semi, fontSize: 14 },
  empty: { color: colors.muted, fontSize: 13.5, fontFamily: font.body, lineHeight: 20 },
  friendRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.surface,
    borderRadius: radius.lg, padding: 12, marginBottom: 9, borderWidth: 1, borderColor: colors.line, ...shadow.card,
  },
  requestRow: { borderColor: colors.orange },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", marginRight: 12 },
  avatarText: { color: "#fff", fontFamily: font.title, fontSize: 16 },
  friendName: { color: colors.ink, fontSize: 15, fontFamily: font.bodySemi },
  friendMeta: { color: colors.muted, fontSize: 12.5, fontFamily: font.body },
  acceptBtn: {
    backgroundColor: colors.orange, borderRadius: radius.sm, paddingHorizontal: 14,
    paddingVertical: 8, marginRight: 6,
  },
  acceptText: { color: colors.onOrange, fontSize: 12.5, fontFamily: font.semi },
  declineBtn: {
    backgroundColor: colors.surface2, borderRadius: radius.sm, paddingHorizontal: 10,
    paddingVertical: 8, borderWidth: 1, borderColor: colors.line,
  },
  hint: { color: colors.faint, fontSize: 12, fontFamily: font.body, textAlign: "center", marginTop: 16, marginBottom: 40 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(7,32,48,0.55)", justifyContent: "flex-end" },
  modal: {
    backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 40,
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { color: colors.ink, fontSize: 19, fontFamily: font.title },
  profileTop: { alignItems: "center", marginBottom: 20 },
  bigAvatar: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  bigAvatarText: { color: "#fff", fontSize: 30, fontFamily: font.title },
  profileName: { color: colors.ink, fontSize: 21, fontFamily: font.title, letterSpacing: -0.3 },
  profileUsername: { color: colors.teal, fontSize: 14, fontFamily: font.bodySemi, marginTop: 2 },
  profileBio: {
    color: colors.muted, fontSize: 13.5, fontFamily: font.body, textAlign: "center",
    marginTop: 8, paddingHorizontal: 24, lineHeight: 20,
  },
  infoBox: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: colors.line,
  },
  infoRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
  infoLabel: { color: colors.muted, fontSize: 13.5, fontFamily: font.bodyMedium },
  infoValue: { color: colors.ink, fontSize: 13.5, fontFamily: font.bodySemi, flexShrink: 1, textAlign: "right" },
  statsRow: { flexDirection: "row", gap: 10 },
  stat: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14,
    alignItems: "center", borderWidth: 1, borderColor: colors.line,
  },
  statNum: { color: colors.ink, fontSize: 21, fontFamily: font.title },
  statLabel: { color: colors.muted, fontSize: 11.5, fontFamily: font.bodyMedium, marginTop: 2 },
});
