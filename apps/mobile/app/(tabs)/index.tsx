import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useAuthStore } from "../../hooks/useAuthStore";
import { api } from "../../lib/api";

type Plan = {
  id: string;
  title: string;
  type: string;
  startDate: string | null;
  location: string | null;
  status: string;
  group: { name: string };
  _count: { messages: number };
};

export default function HomeScreen() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadPlans = async () => {
    try {
      const groups = await api.get("/groups");
      const allPlans: Plan[] = [];
      for (const group of groups.data) {
        const res = await api.get(`/plans/group/${group.id}`);
        allPlans.push(...res.data.map((p: Plan) => ({ ...p, group: { name: group.name } })));
      }
      setPlans(allPlans.filter((p) => p.status !== "completed").slice(0, 10));
    } catch (e) {
      console.log(e);
    }
  };

  useEffect(() => { loadPlans(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPlans();
    setRefreshing(false);
  };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}
    >
      <View style={styles.header}>
        <Text style={styles.greeting}>{greeting()}, {user?.name?.split(" ")[0]} 👋</Text>
        <Text style={styles.subtitle}>Here's what's coming up</Text>
      </View>

      {plans.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🗓️</Text>
          <Text style={styles.emptyText}>No upcoming plans</Text>
          <Text style={styles.emptySubtext}>Create a group and start planning!</Text>
        </View>
      ) : (
        plans.map((plan) => (
          <TouchableOpacity key={plan.id} style={styles.card} onPress={() => router.push(`/plan/${plan.id}`)}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardType}>{plan.type === "quick" ? "⚡ Quick" : "🗓️ Plan"}</Text>
              <Text style={styles.cardGroup}>{plan.group.name}</Text>
            </View>
            <Text style={styles.cardTitle}>{plan.title}</Text>
            {plan.startDate && (
              <Text style={styles.cardDate}>
                📅 {new Date(plan.startDate).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
              </Text>
            )}
            {plan.location && <Text style={styles.cardLocation}>📍 {plan.location}</Text>}
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  header: { padding: 24, paddingTop: 60 },
  greeting: { fontSize: 28, fontWeight: "800", color: "#ffffff" },
  subtitle: { color: "#94a3b8", fontSize: 16, marginTop: 4 },
  empty: { alignItems: "center", marginTop: 80 },
  emptyIcon: { fontSize: 56 },
  emptyText: { color: "#ffffff", fontSize: 20, fontWeight: "700", marginTop: 16 },
  emptySubtext: { color: "#64748b", fontSize: 15, marginTop: 8 },
  card: { margin: 12, marginTop: 0, backgroundColor: "#1e293b", borderRadius: 16, padding: 16 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  cardType: { color: "#6366f1", fontSize: 13, fontWeight: "600" },
  cardGroup: { color: "#64748b", fontSize: 13 },
  cardTitle: { color: "#ffffff", fontSize: 18, fontWeight: "700", marginBottom: 8 },
  cardDate: { color: "#94a3b8", fontSize: 14, marginBottom: 4 },
  cardLocation: { color: "#94a3b8", fontSize: 14 },
});
