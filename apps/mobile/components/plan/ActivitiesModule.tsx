import { useCallback, useEffect, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  Alert, RefreshControl, Keyboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../lib/api";
import { getSocket } from "../../lib/socket";
import { colors, font, radius, shadow } from "../../lib/theme";

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
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.orange} />}
      >
        {activities.map((act, i) => (
          <TouchableOpacity
            key={act.id}
            style={styles.row}
            onPress={() => toggleDone(act)}
            onLongPress={() => deleteActivity(act)}
          >
            <Text style={styles.orderNum}>{i + 1}</Text>
            <Ionicons
              name={act.done ? "checkbox" : "square-outline"}
              size={21}
              color={act.done ? colors.teal : colors.faint}
              style={{ marginRight: 10 }}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, act.done && styles.titleDone]}>{act.title}</Text>
              {act.time && (
                <View style={styles.timeRow}>
                  <Ionicons name="time-outline" size={12} color={colors.teal} />
                  <Text style={styles.time}>
                    {new Date(act.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
              )}
              {act.notes && <Text style={styles.notes}>{act.notes}</Text>}
            </View>
            {canManage && (
              <View style={styles.arrows}>
                <TouchableOpacity onPress={() => move(i, -1)} disabled={i === 0} style={{ padding: 3 }}>
                  <Ionicons name="chevron-up" size={17} color={i === 0 ? colors.line : colors.teal} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => move(i, 1)} disabled={i === activities.length - 1} style={{ padding: 3 }}>
                  <Ionicons name="chevron-down" size={17} color={i === activities.length - 1 ? colors.line : colors.teal} />
                </TouchableOpacity>
              </View>
            )}
          </TouchableOpacity>
        ))}
        {activities.length === 0 && (
          <Text style={styles.empty}>Add what you'll do, in order</Text>
        )}
        <View style={{ height: 20 }} />
      </ScrollView>

      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, { flex: 2 }]}
          placeholder="Hike to the lake..."
          placeholderTextColor={colors.faint}
          value={newTitle}
          onChangeText={setNewTitle}
          onSubmitEditing={addActivity}
          returnKeyType="done"
        />
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="18:00"
          placeholderTextColor={colors.faint}
          value={newTime}
          onChangeText={setNewTime}
          autoCapitalize="none"
        />
        <TouchableOpacity
          style={[styles.addBtn, !newTitle.trim() && { opacity: 0.5 }]}
          onPress={() => { addActivity(); Keyboard.dismiss(); }}
          disabled={!newTitle.trim()}
        >
          <Ionicons name="add" size={22} color={colors.onOrange} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  progressCard: {
    margin: 12, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16,
    borderWidth: 1, borderColor: colors.line, ...shadow.card,
  },
  progressText: { color: colors.ink, fontSize: 14, fontFamily: font.semi, marginBottom: 10 },
  progressBar: { height: 8, backgroundColor: colors.line, borderRadius: 4, overflow: "hidden" },
  progressFill: { height: 8, backgroundColor: colors.teal, borderRadius: 4 },
  row: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.surface,
    borderRadius: radius.md, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.line,
  },
  orderNum: { color: colors.faint, fontSize: 12.5, fontFamily: font.bodyBold, width: 20 },
  title: { color: colors.ink, fontSize: 14.5, fontFamily: font.bodySemi },
  titleDone: { color: colors.faint, textDecorationLine: "line-through" },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  time: { color: colors.teal, fontSize: 12, fontFamily: font.bodyMedium },
  notes: { color: colors.muted, fontSize: 12, fontFamily: font.body, marginTop: 2 },
  arrows: { marginLeft: 8, alignItems: "center", gap: 2 },
  empty: { color: colors.faint, textAlign: "center", marginTop: 40, fontSize: 13.5, fontFamily: font.body },
  inputRow: {
    flexDirection: "row", padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: colors.line,
    backgroundColor: colors.surface,
  },
  input: {
    backgroundColor: colors.surface2, borderRadius: radius.md, padding: 13, color: colors.ink,
    fontSize: 14, fontFamily: font.bodyMedium, borderWidth: 1, borderColor: colors.line,
  },
  addBtn: {
    backgroundColor: colors.orange, borderRadius: radius.md, width: 48,
    alignItems: "center", justifyContent: "center", ...shadow.orange,
  },
});
