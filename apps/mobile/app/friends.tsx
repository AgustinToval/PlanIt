import { useCallback, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  Alert, RefreshControl,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { api } from "../lib/api";

type Friend = { id: string; name: string | null; username: string | null; avatar: string | null };

export default function FriendsScreen() {
  const router = useRouter();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const res = await api.get("/friends");
      setFriends(res.data);
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
      Alert.alert("✅ Friend added", res.data.name ?? q);
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.error ?? "Could not add friend");
    } finally {
      setBusy(false);
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

      <Text style={[styles.label, { marginTop: 24 }]}>
        Your friends ({friends.length})
      </Text>
      {friends.length === 0 ? (
        <Text style={styles.empty}>
          No friends yet — add them by email or username. They need a PlanIt account first.
        </Text>
      ) : (
        friends.map((f) => (
          <TouchableOpacity key={f.id} style={styles.friendRow} onLongPress={() => removeFriend(f)}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(f.name ?? "?")[0]?.toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.friendName}>{f.name ?? "?"}</Text>
              {f.username && <Text style={styles.friendMeta}>@{f.username}</Text>}
            </View>
          </TouchableOpacity>
        ))
      )}
      <Text style={styles.hint}>Long-press a friend to remove them</Text>
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
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#6366f1", alignItems: "center", justifyContent: "center", marginRight: 12 },
  avatarText: { color: "#ffffff", fontWeight: "800", fontSize: 17 },
  friendName: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
  friendMeta: { color: "#64748b", fontSize: 13 },
  hint: { color: "#475569", fontSize: 12, textAlign: "center", marginTop: 16 },
});
