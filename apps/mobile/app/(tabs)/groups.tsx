import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Image } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../lib/api";
import { useAuthStore } from "../../hooks/useAuthStore";
import { useTheme, useT } from "../../hooks/useSettings";
import { font, radius, shadow, userColor, Palette } from "../../lib/theme";

type Group = {
  id: string;
  name: string;
  photo?: string | null;
  description: string | null;
  lastActivityAt: string;
  _count: { plans: number };
  members: { lastSeenAt?: string; user: { id?: string; name: string | null; avatar: string | null } }[];
};

export default function GroupsScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const c = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(c), [c]);
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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={c.orange} />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{t("groups.title")}</Text>
          <Text style={styles.subtitle}>{t("groups.sub")}</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push("/create-group")}>
          <Ionicons name="add" size={17} color={c.onOrange} />
          <Text style={styles.addBtnText}>{t("groups.new")}</Text>
        </TouchableOpacity>
      </View>

      {groups.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="people-outline" size={40} color={c.teal} />
          </View>
          <Text style={styles.emptyText}>{t("groups.emptyTitle")}</Text>
          <Text style={styles.emptySubtext}>{t("groups.emptySub")}</Text>
          <TouchableOpacity style={styles.createBtn} onPress={() => router.push("/create-group")}>
            <Text style={styles.createBtnText}>{t("groups.create")}</Text>
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
              {group.photo ? (
                <Image source={{ uri: group.photo }} style={styles.avatarImg} />
              ) : (
                <View style={[styles.avatar, { backgroundColor: userColor(group.id) }]}>
                  <Text style={styles.avatarText}>{group.name[0]?.toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.cardInfo}>
                <Text style={styles.cardName}>{group.name}</Text>
                {group.description && <Text style={styles.cardDesc} numberOfLines={1}>{group.description}</Text>}
              </View>
              <Ionicons name="chevron-forward" size={17} color={c.faint} />
            </View>
            <View style={styles.cardFooter}>
              <View style={styles.metaItem}>
                <Ionicons name="people-outline" size={13} color={c.muted} />
                <Text style={styles.cardMeta}>{group.members.length} {t("groups.members")}</Text>
              </View>
              <View style={styles.metaItem}>
                <Ionicons name="calendar-outline" size={13} color={c.muted} />
                <Text style={styles.cardMeta}>{group._count.plans} {t("groups.plans")}</Text>
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

const makeStyles = (c: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, paddingTop: 60 },
  title: { fontSize: 25, fontFamily: font.title, color: c.ink, letterSpacing: -0.5 },
  subtitle: { color: c.muted, fontSize: 12.5, fontFamily: font.bodyMedium, marginTop: 1 },
  addBtn: {
    flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: c.orange,
    borderRadius: radius.md, paddingHorizontal: 13, paddingVertical: 10, ...shadow.orange,
  },
  addBtnText: { color: c.onOrange, fontFamily: font.semi, fontSize: 14 },
  empty: { alignItems: "center", marginTop: 80 },
  emptyIconWrap: {
    width: 84, height: 84, borderRadius: 26, backgroundColor: c.tealSoft,
    alignItems: "center", justifyContent: "center",
  },
  emptyText: { color: c.ink, fontSize: 19, fontFamily: font.title, marginTop: 16 },
  emptySubtext: { color: c.muted, fontSize: 14, fontFamily: font.bodyMedium, marginTop: 8 },
  createBtn: {
    marginTop: 24, backgroundColor: c.orange, borderRadius: radius.md,
    paddingHorizontal: 24, paddingVertical: 14, ...shadow.orange,
  },
  createBtnText: { color: c.onOrange, fontFamily: font.semi, fontSize: 15 },
  card: {
    marginHorizontal: 16, marginBottom: 12, backgroundColor: c.surface, borderRadius: radius.lg,
    padding: 15, borderWidth: 1, borderColor: c.line, ...shadow.card,
  },
  cardTop: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: "center", justifyContent: "center", marginRight: 12,
  },
  avatarImg: { width: 48, height: 48, borderRadius: 24, marginRight: 12 },
  avatarText: { color: "#fff", fontSize: 19, fontFamily: font.title },
  cardInfo: { flex: 1 },
  cardName: { color: c.ink, fontSize: 16.5, fontFamily: font.semi, letterSpacing: -0.2 },
  cardDesc: { color: c.muted, fontSize: 12.5, fontFamily: font.body, marginTop: 2 },
  cardFooter: { flexDirection: "row", gap: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.line },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  cardMeta: { color: c.muted, fontSize: 12.5, fontFamily: font.bodyMedium },
  unseenDot: {
    position: "absolute", top: 12, right: 12, width: 9, height: 9, borderRadius: 5,
    backgroundColor: c.orange, zIndex: 1,
  },
});
