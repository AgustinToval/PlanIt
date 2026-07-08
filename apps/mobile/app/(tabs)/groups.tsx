import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { api } from "../../lib/api";

type Group = {
  id: string;
  name: string;
  description: string | null;
  _count: { plans: number };
  members: { user: { name: string | null; avatar: string | null } }[];
};

export default function GroupsScreen() {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const res = await api.get("/groups");
      setGroups(res.data);
    } catch (e) { console.log(e); }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor="#6366f1" />}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Your Groups</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push("/create-group")}>
          <Text style={styles.addBtnText}>+ New</Text>
        </TouchableOpacity>
      </View>

      {groups.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>👥</Text>
          <Text style={styles.emptyText}>No groups yet</Text>
          <Text style={styles.emptySubtext}>Create one and invite your friends</Text>
          <TouchableOpacity style={styles.createBtn} onPress={() => router.push("/create-group")}>
            <Text style={styles.createBtnText}>Create a Group</Text>
          </TouchableOpacity>
        </View>
      ) : (
        groups.map((group) => (
          <TouchableOpacity key={group.id} style={styles.card} onPress={() => router.push(`/group/${group.id}`)}>
            <View style={styles.cardTop}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{group.name[0]?.toUpperCase()}</Text>
              </View>
              <View style={styles.cardInfo}>
                <Text style={styles.cardName}>{group.name}</Text>
                {group.description && <Text style={styles.cardDesc}>{group.description}</Text>}
              </View>
            </View>
            <View style={styles.cardFooter}>
              <Text style={styles.cardMeta}>👥 {group.members.length} members</Text>
              <Text style={styles.cardMeta}>🗓️ {group._count.plans} plans</Text>
            </View>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 24, paddingTop: 60 },
  title: { fontSize: 28, fontWeight: "800", color: "#ffffff" },
  addBtn: { backgroundColor: "#6366f1", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8 },
  addBtnText: { color: "#ffffff", fontWeight: "700", fontSize: 15 },
  empty: { alignItems: "center", marginTop: 80 },
  emptyIcon: { fontSize: 56 },
  emptyText: { color: "#ffffff", fontSize: 20, fontWeight: "700", marginTop: 16 },
  emptySubtext: { color: "#64748b", fontSize: 15, marginTop: 8 },
  createBtn: { marginTop: 24, backgroundColor: "#6366f1", borderRadius: 14, paddingHorizontal: 24, paddingVertical: 14 },
  createBtnText: { color: "#ffffff", fontWeight: "700", fontSize: 16 },
  card: { margin: 12, marginTop: 0, backgroundColor: "#1e293b", borderRadius: 16, padding: 16 },
  cardTop: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#6366f1", alignItems: "center", justifyContent: "center", marginRight: 12 },
  avatarText: { color: "#ffffff", fontSize: 20, fontWeight: "800" },
  cardInfo: { flex: 1 },
  cardName: { color: "#ffffff", fontSize: 18, fontWeight: "700" },
  cardDesc: { color: "#94a3b8", fontSize: 14, marginTop: 2 },
  cardFooter: { flexDirection: "row", gap: 16 },
  cardMeta: { color: "#64748b", fontSize: 13 },
});
