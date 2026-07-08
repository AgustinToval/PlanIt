import { useCallback, useEffect, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  Alert, RefreshControl, Keyboard,
} from "react-native";
import { api } from "../../lib/api";
import { getSocket } from "../../lib/socket";

type Activity = {
  id: string;
  title: string;
  notes: string | null;
  time: string | null;
  order: number;
  done: boolean;
};

export default function ActivitiesModule({
  planId, myRole = "member",
}: { planId: string; myRole?: string }) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newTime, setNewTime] = useState(""); // HH:MM optional
  const [refreshing, setRefreshing] = useState(false);

  const canManage = myRole === "admin" || myRole === "helper";

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/plans/${planId}`);
      setActivities(res.data.activities ?? []);
    } catch { /* noop */ }
  }, [planId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const socket = getSocket();
    const refresh = () => load();
    socket.on("activities:changed", refresh);
    return () => { socket.off("activities:changed", refresh); };
  }, [load]);

  const addActivity = async () => {
    const title = newTitle.trim();
    if (!title) return;
    let time: string | undefined;
    if (/^\d{1,2}:\d{2}$/.test(newTime.trim())) {
      const today = new Date().toISOString().slice(0, 10);
      time = `${today}T${newTime.trim().padStart(5, "0")}:00`;
    }
    setNewTitle("");
    setNewTime("");
    try {
      await api.post(`/activities/plan/${planId}`, { title, time });
      await load();
    } catch {
      Alert.alert("Error", "Could not add the activity");
    }
  };

  const toggleDone = async (act: Activity) => {
    setActivities((prev) => prev.map((a) => (a.id === act.id ? { ...a, done: !a.done } : a)));
    try {
      await api.patch(`/activities/${act.id}`, { done: !act.done });
    } catch {
      await load();
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= activities.length) return;
    const next = [...activities];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setActivities(next); // optimistic
    try {
      await api.post(`/activities/plan/${planId}/reorder`, {
        orderedIds: next.map((a) => a.id),
      });
    } catch {
      await load();
    }
  };

  const deleteActivity = (act: Activity) => {
    if (!canManage) return;
    Alert.alert("Delete activity?", act.title, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/activities/${act.id}`);
            await load();
          } catch { /* noop */ }
        },
      },
    ]);
  };

  const done = activities.filter((a) => a.done).length;

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.progressCard}>
        <Text style={styles.progressText}>
          {activities.length === 0
            ? "No activities planned yet"
            : `${done} / ${activities.length} done`}
        </Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: activities.length ? `${(done / activities.length) * 100}%` : "0%" }]} />
        </View>
      </View>

      <ScrollView
        style={{ flex: 1, paddingHorizontal: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor="#6366f1" />}
      >
        {activities.map((act, i) => (
          <TouchableOpacity
            key={act.id}
            style={styles.row}
            onPress={() => toggleDone(act)}
            onLongPress={() => deleteActivity(act)}
          >
            <Text style={styles.orderNum}>{i + 1}</Text>
            <Text style={styles.checkbox}>{act.done ? "✅" : "⬜"}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, act.done && styles.titleDone]}>{act.title}</Text>
              {act.time && (
                <Text style={styles.time}>
                  🕐 {new Date(act.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>
              )}
              {act.notes && <Text style={styles.notes}>{act.notes}</Text>}
            </View>
            {canManage && (
              <View style={styles.arrows}>
                <TouchableOpacity onPress={() => move(i, -1)} disabled={i === 0}>
                  <Text style={[styles.arrow, i === 0 && styles.arrowDisabled]}>▲</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => move(i, 1)} disabled={i === activities.length - 1}>
                  <Text style={[styles.arrow, i === activities.length - 1 && styles.arrowDisabled]}>▼</Text>
                </TouchableOpacity>
              </View>
            )}
          </TouchableOpacity>
        ))}
        {activities.length === 0 && (
          <Text style={styles.empty}>Add what you'll do, in order 📋</Text>
        )}
        <View style={{ height: 20 }} />
      </ScrollView>

      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, { flex: 2 }]}
          placeholder="Hike to the lake..."
          placeholderTextColor="#475569"
          value={newTitle}
          onChangeText={setNewTitle}
          onSubmitEditing={addActivity}
          returnKeyType="done"
        />
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="18:00"
          placeholderTextColor="#475569"
          value={newTime}
          onChangeText={setNewTime}
          autoCapitalize="none"
        />
        <TouchableOpacity
          style={[styles.addBtn, !newTitle.trim() && { opacity: 0.5 }]}
          onPress={() => { addActivity(); Keyboard.dismiss(); }}
          disabled={!newTitle.trim()}
        >
          <Text style={styles.addText}>＋</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  progressCard: { margin: 12, backgroundColor: "#1e293b", borderRadius: 16, padding: 16 },
  progressText: { color: "#ffffff", fontSize: 15, fontWeight: "700", marginBottom: 10 },
  progressBar: { height: 8, backgroundColor: "#0f172a", borderRadius: 4, overflow: "hidden" },
  progressFill: { height: 8, backgroundColor: "#6366f1", borderRadius: 4 },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: "#1e293b", borderRadius: 14, padding: 12, marginBottom: 8 },
  orderNum: { color: "#475569", fontSize: 13, fontWeight: "800", width: 20 },
  checkbox: { fontSize: 20, marginRight: 10 },
  title: { color: "#ffffff", fontSize: 15, fontWeight: "600" },
  titleDone: { color: "#475569", textDecorationLine: "line-through" },
  time: { color: "#818cf8", fontSize: 12, marginTop: 2 },
  notes: { color: "#64748b", fontSize: 12, marginTop: 2 },
  arrows: { marginLeft: 8, alignItems: "center", gap: 6 },
  arrow: { color: "#6366f1", fontSize: 16, paddingHorizontal: 6 },
  arrowDisabled: { color: "#334155" },
  empty: { color: "#475569", textAlign: "center", marginTop: 40, fontSize: 14 },
  inputRow: { flexDirection: "row", padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: "#1e293b" },
  input: { backgroundColor: "#1e293b", borderRadius: 14, padding: 14, color: "#ffffff", fontSize: 15 },
  addBtn: { backgroundColor: "#6366f1", borderRadius: 14, width: 50, alignItems: "center", justifyContent: "center" },
  addText: { color: "#ffffff", fontSize: 22, fontWeight: "700" },
});
