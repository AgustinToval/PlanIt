import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../lib/api";
import { useAuthStore } from "../../hooks/useAuthStore";
import { colors, font, radius, shadow, userColor } from "../../lib/theme";

type Group = {
  id: string;
  name: string;
  description: string | null;
  lastActivityAt: string;
  _count: { plans: number };
  members: { lastSeenAt?: string; user: { id?: string; name: string | null; avatar: string | null } }[];
};

export default function GroupsScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.orange} />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Groups</Text>
          <Text style={styles.subtitle}>Your people</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push("/create-group")}>
          <Ionicons name="add" size={17} color={colors.onOrange} />
          <Text style={styles.addBtnText}>New</Text>
        </TouchableOpacity>
      </View>

      {groups.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="people-outline" size={40} color={colors.teal} />
          </View>
          <Text style={styles.emptyText}>No groups yet</Text>
          <Text style={styles.emptySubtext}>Create one and invite your friends</Text>
          <TouchableOpacity style={styles.createBtn} onPress={() => router.push("/create-group")}>
            <Text style={styles.createBtnText}>Create a Group</Text>
          </TouchableOpacity>
        </View>
      ) : (
        groups.map((group) => {
          const mySeen = group.members.find((m) => m.user.id === user?.id)?.lastSeenAt;
          const unseen = mySeen ? new Date(group.lastActivityAt) > new Date(mySeen) : false;
          return (
          <TouchableOpacity key={group.id} style={styles.card} onPress={() => router.push(`/group/${group.id}`)}>
            {unseen && <View style={styles.unseenDot} />}
            <View style={styles.cardTop}>
              <View style={[styles.avatar, { backgroundColor: userColor(group.id) }]}>
                <Text style={styles.avatarText}>{group.name[0]?.toUpperCase()}</Text>
              </View>
              <View style={styles.cardInfo}>
                <Text style={styles.cardName}>{group.name}</Text>
                {group.description && <Text style={styles.cardDesc} numberOfLines={1}>{group.description}</Text>}
              </View>
              <Ionicons name="chevron-forward" size={17} color={colors.faint} />
            </View>
            <View style={styles.cardFooter}>
              <View style={styles.metaItem}>
                <Ionicons name="people-outline" size={13} color={colors.muted} />
                <Text style={styles.cardMeta}>{group.members.length} members</Text>
              </View>
              <View style={styles.metaItem}>
                <Ionicons name="calendar-outline" size={13} color={colors.muted} />
                <Text style={styles.cardMeta}>{group._count.plans} plans</Text>
              </View>
            </View>
          </TouchableOpacity>
          );
        })
      )}
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, paddingTop: 60 },
  title: { fontSize: 25, fontFamily: font.title, color: colors.ink, letterSpacing: -0.5 },
  subtitle: { color: colors.muted, fontSize: 12.5, fontFamily: font.bodyMedium, marginTop: 1 },
  addBtn: {
    flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: colors.orange,
    borderRadius: radius.md, paddingHorizontal: 13, paddingVertical: 10, ...shadow.orange,
  },
  addBtnText: { color: colors.onOrange, fontFamily: font.semi, fontSize: 14 },
  empty: { alignItems: "center", marginTop: 80 },
  emptyIconWrap: {
    width: 84, height: 84, borderRadius: 26, backgroundColor: colors.tealSoft,
    alignItems: "center", justifyContent: "center",
  },
  emptyText: { color: colors.ink, fontSize: 19, fontFamily: font.title, marginTop: 16 },
  emptySubtext: { color: colors.muted, fontSize: 14, fontFamily: font.bodyMedium, marginTop: 8 },
  createBtn: {
    marginTop: 24, backgroundColor: colors.orange, borderRadius: radius.md,
    paddingHorizontal: 24, paddingVertical: 14, ...shadow.orange,
  },
  createBtnText: { color: colors.onOrange, fontFamily: font.semi, fontSize: 15 },
  card: {
    marginHorizontal: 16, marginBottom: 12, backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: 15, borderWidth: 1, borderColor: colors.line, ...shadow.card,
  },
  cardTop: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: "center", justifyContent: "center", marginRight: 12,
  },
  avatarText: { color: "#fff", fontSize: 19, fontFamily: font.title },
  cardInfo: { flex: 1 },
  cardName: { color: colors.ink, fontSize: 16.5, fontFamily: font.semi, letterSpacing: -0.2 },
  cardDesc: { color: colors.muted, fontSize: 12.5, fontFamily: font.body, marginTop: 2 },
  cardFooter: { flexDirection: "row", gap: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  cardMeta: { color: colors.muted, fontSize: 12.5, fontFamily: font.bodyMedium },
  unseenDot: {
    position: "absolute", top: 12, right: 12, width: 9, height: 9, borderRadius: 5,
    backgroundColor: colors.orange, zIndex: 1,
  },
});
