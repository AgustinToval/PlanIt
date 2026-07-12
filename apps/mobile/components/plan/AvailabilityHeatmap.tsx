import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
} from "react-native";
import { api } from "../../lib/api";

type Entry = { userId: string; date: string; status: string };
type MemberInfo = { id: string; name: string | null };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

function ymd(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export default function AvailabilityHeatmap({ planId }: { planId: string }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const from = ymd(year, month, 1);
  const to = ymd(year, month, daysInMonth);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/availability/plan/${planId}?from=${from}&to=${to}`);
      setMembers(res.data.members);
      setEntries(res.data.entries);
    } catch { /* noop */ }
  }, [planId, from, to]);

  useEffect(() => { load(); }, [load]);

  // Per-day score: free = 1, maybe = 0.5
  const byDay = useMemo(() => {
    const map: Record<string, { free: string[]; maybe: string[]; busy: string[] }> = {};
    for (const e of entries) {
      const bucket = (map[e.date] ??= { free: [], maybe: [], busy: [] });
      if (e.status === "free") bucket.free.push(e.userId);
      else if (e.status === "maybe") bucket.maybe.push(e.userId);
      else if (e.status === "busy") bucket.busy.push(e.userId);
    }
    return map;
  }, [entries]);

  const bestDays = useMemo(() => {
    return Object.entries(byDay)
      .map(([date, b]) => ({ date, score: b.free.length + b.maybe.length * 0.5, free: b.free.length, maybe: b.maybe.length, busy: b.busy.length }))
      .filter((d) => d.score > 0)
      .sort((a, b) => b.score - a.score || a.date.localeCompare(b.date))
      .slice(0, 3);
  }, [byDay]);

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

  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const total = members.length || 1;
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "?";
  const selected = selectedDay ? byDay[selectedDay] : null;

  return (
    <ScrollView>
      <Text style={styles.subtitle}>
        Darker green = more people free. Everyone sets their days in Calendar → My availability.
      </Text>

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

      <View style={styles.weekRow}>
        {WEEKDAYS.map((w, i) => <Text key={i} style={styles.weekday}>{w}</Text>)}
      </View>

      <View style={styles.grid}>
        {cells.map((day, i) => {
          if (day === null) return <View key={`b${i}`} style={styles.cell} />;
          const key = ymd(year, month, day);
          const bucket = byDay[key];
          const score = bucket ? bucket.free.length + bucket.maybe.length * 0.5 : 0;
          const intensity = Math.min(score / total, 1);
          const bg = intensity > 0 ? `rgba(34, 197, 94, ${0.15 + intensity * 0.6})` : "transparent";
          const allBusy = bucket && bucket.busy.length > 0 && score === 0;
          return (
            <TouchableOpacity
              key={key}
              style={[
                styles.cell,
                { backgroundColor: allBusy ? "rgba(239,68,68,0.25)" : bg },
                selectedDay === key && styles.cellSelected,
              ]}
              onPress={() => setSelectedDay(selectedDay === key ? null : key)}
            >
              <Text style={styles.cellText}>{day}</Text>
              {bucket && (
                <Text style={styles.cellCount}>
                  {bucket.free.length > 0 ? `${bucket.free.length}✓` : bucket.busy.length > 0 ? "✕" : "~"}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Selected day detail */}
      {selected && selectedDay && (
        <View style={styles.detail}>
          <Text style={styles.detailTitle}>
            {new Date(`${selectedDay}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
          </Text>
          {selected.free.length > 0 && (
            <Text style={styles.detailLine}>🟢 Free: {selected.free.map(nameOf).join(", ")}</Text>
          )}
          {selected.maybe.length > 0 && (
            <Text style={styles.detailLine}>🟡 Maybe: {selected.maybe.map(nameOf).join(", ")}</Text>
          )}
          {selected.busy.length > 0 && (
            <Text style={styles.detailLine}>🔴 Busy: {selected.busy.map(nameOf).join(", ")}</Text>
          )}
        </View>
      )}

      {/* Best dates */}
      {bestDays.length > 0 && (
        <View style={styles.best}>
          <Text style={styles.bestTitle}>🏆 Best dates this month</Text>
          {bestDays.map((d, i) => (
            <View key={d.date} style={styles.bestRow}>
              <Text style={styles.bestMedal}>{["🥇", "🥈", "🥉"][i]}</Text>
              <Text style={styles.bestDate}>
                {new Date(`${d.date}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
              </Text>
              <Text style={styles.bestMeta}>
                {d.free}/{members.length} free{d.maybe > 0 ? ` · ${d.maybe} maybe` : ""}
              </Text>
            </View>
          ))}
        </View>
      )}
      {entries.length === 0 && (
        <Text style={styles.empty}>
          No availability set this month yet — ask everyone to mark their days in Calendar → My availability 🟢
        </Text>
      )}
      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  subtitle: { color: "#64748b", fontSize: 13, marginBottom: 14, lineHeight: 18 },
  monthNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  navBtn: { backgroundColor: "#1e293b", borderRadius: 12, width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  navText: { color: "#6366f1", fontSize: 20, fontWeight: "700" },
  monthTitle: { color: "#ffffff", fontSize: 16, fontWeight: "800" },
  weekRow: { flexDirection: "row", marginBottom: 4 },
  weekday: { flex: 1, textAlign: "center", color: "#475569", fontSize: 11, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  cellSelected: { borderWidth: 2, borderColor: "#6366f1" },
  cellText: { color: "#e2e8f0", fontSize: 13 },
  cellCount: { color: "#a7f3d0", fontSize: 9, fontWeight: "700", marginTop: 1 },
  detail: { backgroundColor: "#1e293b", borderRadius: 14, padding: 14, marginTop: 12 },
  detailTitle: { color: "#ffffff", fontSize: 14, fontWeight: "800", marginBottom: 6 },
  detailLine: { color: "#cbd5e1", fontSize: 13, marginBottom: 3 },
  best: { backgroundColor: "#1e293b", borderRadius: 14, padding: 14, marginTop: 12 },
  bestTitle: { color: "#ffffff", fontSize: 14, fontWeight: "800", marginBottom: 8 },
  bestRow: { flexDirection: "row", alignItems: "center", paddingVertical: 4 },
  bestMedal: { fontSize: 16, marginRight: 8 },
  bestDate: { color: "#e2e8f0", fontSize: 14, fontWeight: "700", flex: 1 },
  bestMeta: { color: "#64748b", fontSize: 12 },
  empty: { color: "#475569", fontSize: 13, textAlign: "center", marginTop: 16, lineHeight: 18 },
});
