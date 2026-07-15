import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Alert, Image, ImageBackground } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useAuthStore } from "../../hooks/useAuthStore";
import { api } from "../../lib/api";
import { colors, font, radius, shadow } from "../../lib/theme";

type Plan = {
  id: string;
  title: string;
  type: string;
  description?: string | null;
  bannerImage?: string | null;
  startDate: string | null;
  location: string | null;
  status: string;
  moduleActivity: Record<string, string>;
  members: { rsvp: string; role?: string; moduleSeen?: Record<string, string>; user: { id: string; name: string | null } }[];
  modules: { type: string }[];
};

// Does this plan have activity I haven't seen yet?
function hasUnseen(plan: Plan, myId: string | undefined): boolean {
  if (!myId) return false;
  const seen = plan.members.find((m) => m.user.id === myId)?.moduleSeen ?? {};
  return Object.entries(plan.moduleActivity ?? {}).some(
    ([mod, at]) => !seen[mod] || new Date(at) > new Date(seen[mod]!)
  );
}

export default function PlansScreen() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const [notifCount, setNotifCount] = useState(0);

  const loadPlans = async () => {
    try {
      const res = await api.get("/plans");
      setPlans(res.data.filter((p: Plan) => p.status !== "completed"));
    } catch (e) {
      console.log(e);
    }
  };

  const leavePlan = (plan: Plan) => {
    Alert.alert("Leave plan?", `You will leave "${plan.title}".`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave", style: "destructive",
        onPress: async () => {
          try {
            await api.post(`/plans/${plan.id}/leave`);
            await loadPlans();
          } catch (e: any) {
            Alert.alert("Error", e?.response?.data?.error ?? "Could not leave the plan");
          }
        },
      },
    ]);
  };

  const deletePlan = (plan: Plan) => {
    Alert.alert(
      "Delete plan?",
      `"${plan.title}" and everything in it will be deleted for everyone. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete", style: "destructive",
          onPress: async () => {
            try {
              await api.delete(`/plans/${plan.id}`);
              await loadPlans();
            } catch (e: any) {
              Alert.alert("Error", e?.response?.data?.error ?? "Could not delete the plan");
            }
          },
        },
      ]
    );
  };

  const planActions = (plan: Plan) => {
    const me = plan.members.find((m) => m.user.id === user?.id);
    const isAdmin = me?.role === "admin";
    Alert.alert(plan.title, "What do you want to do?", [
      { text: "Cancel", style: "cancel" },
      { text: "Leave plan", onPress: () => leavePlan(plan) },
      ...(isAdmin
        ? [{ text: "Delete plan", style: "destructive" as const, onPress: () => deletePlan(plan) }]
        : []),
    ]);
  };

  const loadNotifs = async () => {
    try {
      const [fr, gi, pi] = await Promise.all([
        api.get("/friends/requests"),
        api.get("/groups/invitations/mine"),
        api.get("/plans/invitations/mine"),
      ]);
      setNotifCount(fr.data.length + gi.data.length + pi.data.length);
    } catch { /* noop */ }
  };

  useFocusEffect(useCallback(() => { loadPlans(); loadNotifs(); }, []));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPlans();
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.orange} />}
    >
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <Image source={require("../../assets/brand/icon.png")} style={styles.brandLogo} />
          <View>
            <Text style={styles.title}>Plans</Text>
            <Text style={styles.subtitle}>
              Hey {user?.name?.split(" ")[0]}{plans.length > 0 ? ` — ${plans.length} coming up` : ""}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.push("/notifications")}>
            <Ionicons name="notifications-outline" size={20} color={colors.ink} />
            {notifCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{notifCount > 9 ? "9+" : notifCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.addBtn} onPress={() => router.push("/create-plan")}>
            <Ionicons name="add" size={17} color={colors.onOrange} />
            <Text style={styles.addBtnText}>New</Text>
          </TouchableOpacity>
        </View>
      </View>

      {plans.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="calendar-outline" size={40} color={colors.teal} />
          </View>
          <Text style={styles.emptyText}>No plans yet</Text>
          <Text style={styles.emptySubtext}>Create your first plan and invite your people!</Text>
          <TouchableOpacity style={styles.createBtn} onPress={() => router.push("/create-plan")}>
            <Text style={styles.createBtnText}>Create a Plan</Text>
          </TouchableOpacity>
        </View>
      ) : (
        plans.map((plan) => {
          const yes = plan.members.filter((m) => m.rsvp === "yes").length;
          const total = plan.members.length;
          const unseen = hasUnseen(plan, user?.id);
          const quick = plan.type === "quick";

          // Card with a banner photo: dark scrim keeps the info readable
          if (plan.bannerImage) {
            return (
              <TouchableOpacity
                key={plan.id}
                style={styles.bannerCard}
                onPress={() => router.push(`/plan/${plan.id}`)}
                onLongPress={() => planActions(plan)}
              >
                <ImageBackground
                  source={{ uri: plan.bannerImage }}
                  style={styles.bannerBg}
                  imageStyle={{ borderRadius: 22 }}
                >
                  <LinearGradient
                    colors={["rgba(11,57,84,0.20)", "rgba(7,32,48,0.82)"]}
                    style={styles.bannerScrim}
                  >
                    {unseen && <View style={styles.unseenDot} />}
                    <View style={styles.cardHeader}>
                      <View style={styles.bannerChip}>
                        <Ionicons
                          name={quick ? "flash" : "calendar-clear-outline"}
                          size={12}
                          color="#FFFFFF"
                        />
                        <Text style={styles.bannerChipText}>{quick ? "Quick plan" : "Plan"}</Text>
                      </View>
                      <Text style={styles.bannerCount}>{yes}/{total} in</Text>
                    </View>
                    <Text style={styles.bannerTitle}>{plan.title}</Text>
                    {!!plan.description && (
                      <Text style={styles.bannerDesc} numberOfLines={1}>{plan.description}</Text>
                    )}
                    <View style={styles.cardMetaRow}>
                      {plan.startDate && (
                        <View style={styles.metaItem}>
                          <Ionicons name="calendar-outline" size={13} color="rgba(255,255,255,0.9)" />
                          <Text style={styles.bannerMeta}>
                            {new Date(plan.startDate).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                            {" · "}
                            {new Date(plan.startDate).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                          </Text>
                        </View>
                      )}
                      {plan.location && (
                        <View style={styles.metaItem}>
                          <Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.9)" />
                          <Text style={styles.bannerMeta} numberOfLines={1}>{plan.location}</Text>
                        </View>
                      )}
                    </View>
                  </LinearGradient>
                </ImageBackground>
              </TouchableOpacity>
            );
          }

          return (
            <TouchableOpacity
              key={plan.id}
              style={styles.card}
              onPress={() => router.push(`/plan/${plan.id}`)}
              onLongPress={() => planActions(plan)}
            >
              <View style={[styles.accent, { backgroundColor: quick ? colors.orange : colors.teal }]} />
              {unseen && <View style={styles.unseenDot} />}
              <View style={styles.cardHeader}>
                <View style={[styles.chip, { backgroundColor: quick ? colors.orangeSoft : colors.tealSoft }]}>
                  <Ionicons
                    name={quick ? "flash" : "calendar-clear-outline"}
                    size={12}
                    color={quick ? colors.orange : colors.teal}
                  />
                  <Text style={[styles.chipText, { color: quick ? colors.orange : colors.teal }]}>
                    {quick ? "Quick plan" : "Plan"}
                  </Text>
                </View>
                <Text style={styles.cardCount}>{yes}/{total} in</Text>
              </View>
              <Text style={styles.cardTitle}>{plan.title}</Text>
              {!!plan.description && (
                <Text style={styles.cardDesc} numberOfLines={1}>{plan.description}</Text>
              )}
              <View style={styles.cardMetaRow}>
                {plan.startDate && (
                  <View style={styles.metaItem}>
                    <Ionicons name="calendar-outline" size={13} color={colors.muted} />
                    <Text style={styles.cardMeta}>
                      {new Date(plan.startDate).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                      {" · "}
                      {new Date(plan.startDate).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                    </Text>
                  </View>
                )}
                {plan.location && (
                  <View style={styles.metaItem}>
                    <Ionicons name="location-outline" size={13} color={colors.muted} />
                    <Text style={styles.cardMeta} numberOfLines={1}>{plan.location}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        })
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, paddingTop: 60 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  brandLogo: { width: 40, height: 40, borderRadius: 12, ...shadow.orange },
  title: { fontSize: 25, fontFamily: font.title, color: colors.ink, letterSpacing: -0.5 },
  subtitle: { color: colors.muted, fontSize: 12.5, fontFamily: font.bodyMedium, marginTop: 1 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 13, backgroundColor: colors.surface,
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.line, ...shadow.card,
  },
  addBtn: {
    flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: colors.orange,
    borderRadius: radius.md, paddingHorizontal: 13, paddingVertical: 10, ...shadow.orange,
  },
  addBtnText: { color: colors.onOrange, fontFamily: font.semi, fontSize: 14 },
  badge: {
    position: "absolute", top: -5, right: -5, backgroundColor: colors.orange, borderRadius: 9,
    minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 4,
    borderWidth: 2, borderColor: colors.bg,
  },
  badgeText: { color: "#fff", fontSize: 10, fontFamily: font.semi },
  unseenDot: {
    position: "absolute", top: 13, right: 13, width: 9, height: 9, borderRadius: 5,
    backgroundColor: colors.orange, zIndex: 1,
  },
  empty: { alignItems: "center", marginTop: 80 },
  emptyIconWrap: {
    width: 84, height: 84, borderRadius: 26, backgroundColor: colors.tealSoft,
    alignItems: "center", justifyContent: "center",
  },
  emptyText: { color: colors.ink, fontSize: 19, fontFamily: font.title, marginTop: 16 },
  emptySubtext: {
    color: colors.muted, fontSize: 14, fontFamily: font.bodyMedium, marginTop: 8,
    textAlign: "center", paddingHorizontal: 40,
  },
  createBtn: {
    marginTop: 24, backgroundColor: colors.orange, borderRadius: radius.md,
    paddingHorizontal: 24, paddingVertical: 14, ...shadow.orange,
  },
  createBtnText: { color: colors.onOrange, fontFamily: font.semi, fontSize: 15 },
  card: {
    marginHorizontal: 16, marginBottom: 14, backgroundColor: colors.surface, borderRadius: radius.xl,
    padding: 16, paddingLeft: 20, borderWidth: 1, borderColor: colors.line, overflow: "hidden", ...shadow.card,
  },
  accent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 5 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill,
  },
  chipText: { fontSize: 11.5, fontFamily: font.semi },
  cardCount: { color: colors.teal, fontSize: 12.5, fontFamily: font.semi },
  cardTitle: { color: colors.ink, fontSize: 17.5, fontFamily: font.semi, letterSpacing: -0.2, marginBottom: 4 },
  cardDesc: { color: colors.muted, fontSize: 12.5, fontFamily: font.body, marginBottom: 6 },
  cardMetaRow: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 2 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5, maxWidth: "60%" },
  cardMeta: { color: colors.muted, fontSize: 12.5, fontFamily: font.bodyMedium },
  // Banner (photo) cards — white text over a dark petrol scrim
  bannerCard: {
    marginHorizontal: 16, marginBottom: 14, borderRadius: 22,
    overflow: "hidden", ...shadow.card,
  },
  bannerBg: { width: "100%" },
  bannerScrim: { padding: 16, minHeight: 150, justifyContent: "flex-end", borderRadius: 22 },
  bannerChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  bannerChipText: { fontSize: 11.5, fontFamily: font.semi, color: "#FFFFFF" },
  bannerCount: { color: "#FFFFFF", fontSize: 12.5, fontFamily: font.semi },
  bannerTitle: {
    color: "#FFFFFF", fontSize: 18.5, fontFamily: font.title, letterSpacing: -0.2,
    marginBottom: 4, textShadowColor: "rgba(0,0,0,0.35)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6,
  },
  bannerDesc: { color: "rgba(255,255,255,0.88)", fontSize: 12.5, fontFamily: font.body, marginBottom: 6 },
  bannerMeta: { color: "rgba(255,255,255,0.92)", fontSize: 12.5, fontFamily: font.bodyMedium },
});
