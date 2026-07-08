import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { useAuthStore } from "../../hooks/useAuthStore";
import { api } from "../../lib/api";

type Plan = {
  id: string;
  title: string;
  type: string;
  startDate: string | null;
  location: string | null;
  status: string;
  members: { rsvp: string; user: { id: string; name: string | null } }[];
  modules: { type: string }[];
};

export default function PlansScreen() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadPlans = async () => {
    try {
      const res = await api.get("/plans");
      setPlans(res.data.filter((p: Plan) => p.status !== "completed"));
    } catch (e) {
      console.log(e);
    }
  };

  useFocusEffect(useCallback(() => { loadPlans(); }, []));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPlans();
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Plans</Text>
          <Text style={styles.subtitle}>Hey {user?.name?.split(" ")[0]} 👋</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push("/create-plan")}>
          <Text style={styles.addBtnText}>+ New Plan</Text>
        </TouchableOpacity>
      </View>

      {plans.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🗓️</Text>
          <Text style={styles.emptyText}>No plans yet</Text>
          <Text style={styles.emptySubtext}>Create your first plan and invite your people!</Text>
          <TouchableOpacity style={styles.createBtn} onPress={() => router.push("/create-plan")}>
            <Text style={styles.createBtnText}>Create a Plan</Text>
          </TouchableOpacity>
        </View>
      ) : (
        plans.map((plan) => {
          const yes = plan.members.filter((m) => m.rsvp === "yes").length;
          return (
            <TouchableOpacity key={plan.id} style={styles.card} onPress={() => router.push(`/plan/${plan.id}`)}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardType}>{plan.type === "quick" ? "⚡ Quick Plan" : "🗓️ Plan"}</Text>
                <Text style={styles.cardCount}>✅ {yes} in</Text>
              </View>
              <Text style={styles.cardTitle}>{plan.title}</Text>
              <View style={styles.cardMetaRow}>
                {plan.startDate && (
                  <Text style={styles.cardMeta}>
                    📅 {new Date(plan.startDate).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                  </Text>
                )}
                {plan.location && <Text style={styles.cardMeta}>📍 {plan.location}</Text>}
              </View>
              {plan.modules.length > 0 && (
                <Text style={styles.cardModules}>
                  {plan.modules.map((m) => moduleEmoji(m.type)).join(" ")}
                </Text>
              )}
            </TouchableOpacity>
          );
        })
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function moduleEmoji(type: string): string {
  const map: Record<string, string> = {
    expenses: "💸", checklist: "🛒", activities: "📋", votes: "🗳️",
    walkietalkie: "🎙️", gallery: "📸", playlist: "🎵", files: "📎", meetup: "📍",
  };
  return map[type] ?? "🧩";
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 24, paddingTop: 60 },
  title: { fontSize: 28, fontWeight: "800", color: "#ffffff" },
  subtitle: { color: "#94a3b8", fontSize: 15, marginTop: 2 },
  addBtn: { backgroundColor: "#6366f1", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  addBtnText: { color: "#ffffff", fontWeight: "700", fontSize: 15 },
  empty: { alignItems: "center", marginTop: 80 },
  emptyIcon: { fontSize: 56 },
  emptyText: { color: "#ffffff", fontSize: 20, fontWeight: "700", marginTop: 16 },
  emptySubtext: { color: "#64748b", fontSize: 15, marginTop: 8, textAlign: "center", paddingHorizontal: 40 },
  createBtn: { marginTop: 24, backgroundColor: "#6366f1", borderRadius: 14, paddingHorizontal: 24, paddingVertical: 14 },
  createBtnText: { color: "#ffffff", fontWeight: "700", fontSize: 16 },
  card: { margin: 12, marginTop: 0, backgroundColor: "#1e293b", borderRadius: 16, padding: 16 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  cardType: { color: "#6366f1", fontSize: 13, fontWeight: "600" },
  cardCount: { color: "#22c55e", fontSize: 13, fontWeight: "600" },
  cardTitle: { color: "#ffffff", fontSize: 18, fontWeight: "700", marginBottom: 8 },
  cardMetaRow: { flexDirection: "row", gap: 16 },
  cardMeta: { color: "#94a3b8", fontSize: 14 },
  cardModules: { fontSize: 16, marginTop: 10 },
});
