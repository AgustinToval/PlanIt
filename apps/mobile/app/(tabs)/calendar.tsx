import { useCallback, useMemo, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { api } from "../../lib/api";

type Plan = {
  id: string;
  title: string;
  type: string;
  startDate: string | null;
  location: string | null;
};

type AvailEntry = { date: string; status: string };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

function ymd(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const AVAIL_COLORS: Record<string, string> = {
  free: "#22c55e",
  maybe: "#eab308",
  busy: "#ef4444",
};

const CYCLE: Record<string, string> = {
  none: "free",
  free: "maybe",
  maybe: "busy",
  busy: "none",
};

export default function CalendarScreen() {
  const router = useRouter();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-based
  const [plans, setPlans] = useState<Plan[]>([]);
  const [avail, setAvail] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<"plans" | "availability">("plans");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const monthStart = ymd(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthEnd = ymd(year, month, daysInMonth);

  const load = useCallback(async () => {
    try {
      const [p, a] = await Promise.all([
        api.get("/plans"),
        api.get(`/availability/mine?from=${monthStart}&to=${monthEnd}`),
      ]);
      setPlans(p.data);
      const map: Record<string, string> = {};
      (a.data as AvailEntry[]).forEach((e) => { map[e.date] = e.status; });
      setAvail(map);
    } catch { /* noop */ }
  }, [monthStart, monthEnd]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Plans indexed by day of this month
  const plansByDay = useMemo(() => {
    const map: Record<string, Plan[]> = {};
    for (const plan of plans) {
      if (!plan.startDate) continue;
      const d = new Date(plan.startDate);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const key = ymd(year, month, d.getDate());
        (map[key] ??= []).push(plan);
      }
    }
    return map;
  }, [plans, year, month]);

  const prevMonth = () => {
    setSelectedDay(null);
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    setSelectedDay(null);
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };

  const onDayPress = async (dateKey: string) => {
    if (mode === "plans") {
      setSelectedDay(selectedDay === dateKey ? null : dateKey);
      return;
    }
    // availability mode: cycle none → free → maybe → busy → none
    const current = avail[dateKey] ?? "none";
    const next = CYCLE[current]!;
    setAvail((prev) => {
      const copy = { ...prev };
      if (next === "none") delete copy[dateKey];
      else copy[dateKey] = next;
      return copy;
    });
    try {
      await api.put("/availability/mine", { date: dateKey, status: next });
    } catch {
      await load();
    }
  };

  // Build grid cells: leading blanks + days
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Monday = 0
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const todayKey = ymd(today.getFullYear(), today.getMonth(), today.getDate());
  const dayPlans = selectedDay ? plansByDay[selectedDay] ?? [] : [];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Calendar</Text>
      </View>

      {/* Mode toggle */}
      <View style={styles.modeRow}>
        <TouchableOpacity
          style={[styles.modeBtn, mode === "plans" && styles.modeBtnActive]}
          onPress={() => setMode("plans")}
        >
          <Text style={[styles.modeText, mode === "plans" && styles.modeTextActive]}>🗓️ My plans</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, mode === "availability" && styles.modeBtnActive]}
          onPress={() => { setSelectedDay(null); setMode("availability"); }}
        >
          <Text style={[styles.modeText, mode === "availability" && styles.modeTextActive]}>🟢 My availability</Text>
        </TouchableOpacity>
      </View>

      {/* Month nav */}
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={prevMonth} style={styles.navBtn}>
          <Text style={styles.navText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthTitle}>{MONTHS[month]} {year}</Text>
        <TouchableOpacity onPress={nextMonth} style={styles.navBtn}>
          <Text style={styles.navText}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Weekday header */}
      <View style={styles.weekRow}>
        {WEEKDAYS.map((w, i) => (
          <Text key={i} style={styles.weekday}>{w}</Text>
        ))}
      </View>

      {/* Grid */}
      <View style={styles.grid}>
        {cells.map((day, i) => {
          if (day === null) return <View key={`b${i}`} style={styles.cell} />;
          const key = ymd(year, month, day);
          const hasPlans = (plansByDay[key]?.length ?? 0) > 0;
          const availStatus = avail[key];
          const isToday = key === todayKey;
          const isSelected = key === selectedDay;
          return (
            <TouchableOpacity
              key={key}
              style={[
                styles.cell,
                isToday && styles.cellToday,
                isSelected && styles.cellSelected,
                mode === "availability" && availStatus
                  ? { backgroundColor: `${AVAIL_COLORS[availStatus]}33`, borderColor: AVAIL_COLORS[availStatus], borderWidth: 1.5 }
                  : null,
              ]}
              onPress={() => onDayPress(key)}
            >
              <Text style={[styles.cellText, isToday && styles.cellTextToday]}>{day}</Text>
              {mode === "plans" && hasPlans && <View style={styles.planDot} />}
              {mode === "availability" && availStatus && (
                <View style={[styles.availDot, { backgroundColor: AVAIL_COLORS[availStatus] }]} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Legend / helper */}
      {mode === "availability" ? (
        <View style={styles.legend}>
          <Text style={styles.legendText}>Tap a day to cycle:</Text>
          <Text style={styles.legendText}>🟢 Free → 🟡 Maybe → 🔴 Busy → clear</Text>
          <Text style={styles.legendHint}>
            Your friends' plans can use this to find the best date for everyone.
          </Text>
        </View>
      ) : (
        <View style={styles.legend}>
          <Text style={styles.legendText}>● Days with plans — tap to see them</Text>
        </View>
      )}

      {/* Selected day plans */}
      {mode === "plans" && selectedDay && (
        <View style={{ paddingHorizontal: 16 }}>
          <Text style={styles.dayTitle}>
            {new Date(`${selectedDay}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
          </Text>
          {dayPlans.length === 0 ? (
            <Text style={styles.dayEmpty}>No plans this day</Text>
          ) : (
            dayPlans.map((p) => (
              <TouchableOpacity key={p.id} style={styles.dayPlan} onPress={() => router.push(`/plan/${p.id}`)}>
                <Text style={styles.dayPlanTitle}>
                  {p.type === "quick" ? "⚡ " : "🗓️ "}{p.title}
                </Text>
                {p.startDate && (
                  <Text style={styles.dayPlanMeta}>
                    🕐 {new Date(p.startDate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    {p.location ? `  ·  📍 ${p.location}` : ""}
                  </Text>
                )}
              </TouchableOpacity>
            ))
          )}
        </View>
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  header: { padding: 24, paddingTop: 60, paddingBottom: 12 },
  title: { fontSize: 28, fontWeight: "800", color: "#ffffff" },
  modeRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginBottom: 14 },
  modeBtn: { flex: 1, backgroundColor: "#1e293b", borderRadius: 12, paddingVertical: 10, alignItems: "center", borderWidth: 2, borderColor: "transparent" },
  modeBtnActive: { borderColor: "#6366f1", backgroundColor: "#312e81" },
  modeText: { color: "#94a3b8", fontSize: 13, fontWeight: "700" },
  modeTextActive: { color: "#ffffff" },
  monthNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, marginBottom: 10 },
  navBtn: { backgroundColor: "#1e293b", borderRadius: 12, width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  navText: { color: "#6366f1", fontSize: 22, fontWeight: "700" },
  monthTitle: { color: "#ffffff", fontSize: 18, fontWeight: "800" },
  weekRow: { flexDirection: "row", paddingHorizontal: 12, marginBottom: 4 },
  weekday: { flex: 1, textAlign: "center", color: "#475569", fontSize: 12, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12 },
  cell: {
    width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center",
    borderRadius: 12,
  },
  cellToday: { backgroundColor: "#1e293b" },
  cellSelected: { backgroundColor: "#312e81" },
  cellText: { color: "#e2e8f0", fontSize: 15 },
  cellTextToday: { fontWeight: "800", color: "#818cf8" },
  planDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#6366f1", marginTop: 3 },
  availDot: { width: 6, height: 6, borderRadius: 3, marginTop: 3 },
  legend: { backgroundColor: "#1e293b", borderRadius: 14, padding: 14, margin: 16, alignItems: "center" },
  legendText: { color: "#94a3b8", fontSize: 13, marginBottom: 2 },
  legendHint: { color: "#475569", fontSize: 12, marginTop: 6, textAlign: "center" },
  dayTitle: { color: "#ffffff", fontSize: 17, fontWeight: "800", marginBottom: 10 },
  dayEmpty: { color: "#475569", fontSize: 14 },
  dayPlan: { backgroundColor: "#1e293b", borderRadius: 14, padding: 14, marginBottom: 8 },
  dayPlanTitle: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  dayPlanMeta: { color: "#94a3b8", fontSize: 13, marginTop: 3 },
});
