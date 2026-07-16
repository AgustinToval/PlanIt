import { useCallback, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, RefreshControl,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
import { font, radius, shadow, Palette, themedStyles } from "../lib/theme";
import { useTheme, useT } from "../hooks/useSettings";

type FriendReq = { id: string; from: { id: string; name: string | null; username: string | null } };
type GroupInvite = { id: string; group: { id: string; name: string }; invitedBy: string; memberCount: number };
type PlanInvite = {
  id: string;
  plan: { id: string; title: string; type: string; startDate: string | null; location: string | null };
  invitedBy: string; memberCount: number;
};

export default function NotificationsScreen() {
  const c = useTheme();
  const styles = getStyles(c);
  const t = useT();
  const router = useRouter();

  const SectionLabel = ({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) => (
    <View style={styles.sectionRow}>
      <Ionicons name={icon} size={14} color={c.muted} />
      <Text style={styles.section}>{text}</Text>
    </View>
  );

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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={c.orange} />}
    >
      <TouchableOpacity onPress={() => router.back()} style={styles.back}>
        <Ionicons name="chevron-back" size={18} color={c.teal} />
        <Text style={styles.backText}>{t("common.back")}</Text>
      </TouchableOpacity>

      <Text style={styles.title}>{t("scr.notifications")}</Text>

      {total === 0 && (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="notifications-outline" size={40} color={c.teal} />
          </View>
          <Text style={styles.emptyText}>You're all caught up</Text>
          <Text style={styles.emptySub}>Friend requests and invitations will show up here</Text>
        </View>
      )}

      {/* Plan invites */}
      {planInvites.length > 0 && <SectionLabel icon="calendar-outline" text="Plan invitations" />}
      {planInvites.map((inv) => (
        <View key={inv.id} style={styles.card}>
          <View style={styles.cardTitleRow}>
            {inv.plan.type === "quick" && <Ionicons name="flash" size={14} color={c.orange} />}
            <Text style={styles.cardTitle}>{inv.plan.title}</Text>
          </View>
          <Text style={styles.cardMeta}>
            {inv.invitedBy} invited you · {inv.memberCount} going
            {inv.plan.location ? ` · ${inv.plan.location}` : ""}
          </Text>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.accept} onPress={() => respondPlan(inv.id, "accept")}>
              <Text style={styles.acceptText}>{t("common.join")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.decline} onPress={() => respondPlan(inv.id, "decline")}>
              <Text style={styles.declineText}>{t("common.decline")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      {/* Group invites */}
      {groupInvites.length > 0 && <SectionLabel icon="people-outline" text="Group invitations" />}
      {groupInvites.map((inv) => (
        <View key={inv.id} style={styles.card}>
          <Text style={styles.cardTitle}>{inv.group.name}</Text>
          <Text style={styles.cardMeta}>{inv.invitedBy} invited you · {inv.memberCount} members</Text>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.accept} onPress={() => respondGroup(inv.id, "accept")}>
              <Text style={styles.acceptText}>{t("common.join")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.decline} onPress={() => respondGroup(inv.id, "decline")}>
              <Text style={styles.declineText}>{t("common.decline")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      {/* Friend requests */}
      {friendReqs.length > 0 && <SectionLabel icon="person-add-outline" text="Friend requests" />}
      {friendReqs.map((r) => (
        <View key={r.id} style={styles.card}>
          <Text style={styles.cardTitle}>{r.from.name ?? "?"}</Text>
          {r.from.username && <Text style={styles.cardMeta}>@{r.from.username}</Text>}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.accept} onPress={() => respondFriend(r.id, "accept")}>
              <Text style={styles.acceptText}>{t("common.accept")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.decline} onPress={() => respondFriend(r.id, "decline")}>
              <Text style={styles.declineText}>{t("common.decline")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const getStyles = themedStyles((c: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg, padding: 20, paddingTop: 60 },
  back: { flexDirection: "row", alignItems: "center", gap: 2, marginBottom: 16 },
  backText: { color: c.teal, fontSize: 15, fontFamily: font.bodySemi },
  title: { fontSize: 25, fontFamily: font.title, color: c.ink, letterSpacing: -0.5, marginBottom: 12 },
  empty: { alignItems: "center", marginTop: 80 },
  emptyIconWrap: {
    width: 84, height: 84, borderRadius: 26, backgroundColor: c.tealSoft,
    alignItems: "center", justifyContent: "center",
  },
  emptyText: { color: c.ink, fontSize: 19, fontFamily: font.title, marginTop: 16 },
  emptySub: {
    color: c.muted, fontSize: 13.5, fontFamily: font.bodyMedium, marginTop: 8,
    textAlign: "center", paddingHorizontal: 40,
  },
  sectionRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 18, marginBottom: 10 },
  section: {
    color: c.muted, fontSize: 11, fontFamily: font.semi,
    letterSpacing: 1, textTransform: "uppercase",
  },
  card: {
    backgroundColor: c.surface, borderRadius: radius.lg, padding: 15, marginBottom: 10,
    borderWidth: 1, borderColor: c.line, ...shadow.card,
  },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  cardTitle: { color: c.ink, fontSize: 16, fontFamily: font.semi, letterSpacing: -0.2 },
  cardMeta: { color: c.muted, fontSize: 12.5, fontFamily: font.bodyMedium, marginTop: 3 },
  actions: { flexDirection: "row", gap: 10, marginTop: 12 },
  accept: {
    flex: 1, backgroundColor: c.orange, borderRadius: radius.sm, padding: 11,
    alignItems: "center", ...shadow.orange,
  },
  acceptText: { color: c.onOrange, fontFamily: font.semi, fontSize: 13.5 },
  decline: {
    flex: 1, backgroundColor: c.surface2, borderWidth: 1, borderColor: c.line,
    borderRadius: radius.sm, padding: 11, alignItems: "center",
  },
  declineText: { color: c.muted, fontFamily: font.semi, fontSize: 13.5 },
}));
