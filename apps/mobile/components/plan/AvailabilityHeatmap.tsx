import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../lib/api";
import { font, radius, Palette, themedStyles } from "../../lib/theme";
import { useTheme } from "../../hooks/useSettings";

type Entry = { userId: string; date: string; status: string };
type MemberInfo = { id: string; name: string | null };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

function ymd(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export default function AvailabilityHeatmap({ planId }: { planId: string }) {
  const c = useTheme();
  const styles = getStyles(c);
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
        Darker teal = more people free. Everyone sets their days in Calendar → My availability.
      </Text>

      {/* Month nav */}
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={prevMonth} style={styles.navBtn}>
          <Ionicons name="chevron-back" size={18} color={c.teal} />
        </TouchableOpacity>
        <Text style={styles.monthTitle}>{MONTHS[month]} {year}</Text>
        <TouchableOpacity onPress={nextMonth} style={styles.navBtn}>
          <Ionicons name="chevron-forward" size={18} color={c.teal} />
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
          const bg = intensity > 0 ? `rgba(8, 146, 165, ${0.12 + intensity * 0.55})` : "transparent";
          const allBusy = bucket && bucket.busy.length > 0 && score === 0;
          return (
            <TouchableOpacity
              key={key}
              style={[
                styles.cell,
                { backgroundColor: allBusy ? "rgba(224,82,82,0.2)" : bg },
                selectedDay === key && styles.cellSelected,
              ]}
              onPress={() => setSelectedDay(selectedDay === key ? null : key)}
            >
              <Text style={[styles.cellText, intensity > 0.55 && { color: "#fff" }]}>{day}</Text>
              {bucket && (
                <Text style={[styles.cellCount, intensity > 0.55 && { color: "#fff" }]}>
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
            <View style={styles.detailRow}>
              <View style={[styles.dot, { backgroundColor: c.teal }]} />
              <Text style={styles.detailLine}>Free: {selected.free.map(nameOf).join(", ")}</Text>
            </View>
          )}
          {selected.maybe.length > 0 && (
            <View style={styles.detailRow}>
              <View style={[styles.dot, { backgroundColor: "#F0A72B" }]} />
              <Text style={styles.detailLine}>Maybe: {selected.maybe.map(nameOf).join(", ")}</Text>
            </View>
          )}
          {selected.busy.length > 0 && (
            <View style={styles.detailRow}>
              <View style={[styles.dot, { backgroundColor: c.danger }]} />
              <Text style={styles.detailLine}>Busy: {selected.busy.map(nameOf).join(", ")}</Text>
            </View>
          )}
        </View>
      )}

      {/* Best dates */}
      {bestDays.length > 0 && (
        <View style={styles.best}>
          <View style={styles.bestTitleRow}>
            <Ionicons name="trophy-outline" size={15} color={c.orange} />
            <Text style={styles.bestTitle}>Best dates this month</Text>
          </View>
          {bestDays.map((d, i) => (
            <View key={d.date} style={styles.bestRow}>
              <View style={[styles.bestRank, i === 0 && { backgroundColor: c.orange }]}>
                <Text style={[styles.bestRankText, i === 0 && { color: "#fff" }]}>{i + 1}</Text>
              </View>
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
          No availability set this month yet — ask everyone to mark their days in Calendar → My availability
        </Text>
      )}
      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

const getStyles = themedStyles((c: Palette) => StyleSheet.create({
  subtitle: { color: c.muted, fontSize: 12.5, fontFamily: font.body, marginBottom: 14, lineHeight: 18 },
  monthNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  navBtn: {
    backgroundColor: c.surface, borderRadius: radius.md, width: 36, height: 36,
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.line,
  },
  monthTitle: { color: c.ink, fontSize: 15.5, fontFamily: font.semi },
  weekRow: { flexDirection: "row", marginBottom: 4 },
  weekday: { flex: 1, textAlign: "center", color: c.faint, fontSize: 11, fontFamily: font.semi },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center", borderRadius: radius.sm },
  cellSelected: { borderWidth: 2, borderColor: c.orange },
  cellText: { color: c.ink, fontSize: 12.5, fontFamily: font.bodyMedium },
  cellCount: { color: c.teal, fontSize: 9, fontFamily: font.bodyBold, marginTop: 1 },
  detail: {
    backgroundColor: c.surface, borderRadius: radius.md, padding: 14, marginTop: 12,
    borderWidth: 1, borderColor: c.line,
  },
  detailTitle: { color: c.ink, fontSize: 13.5, fontFamily: font.semi, marginBottom: 8 },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 4 },
  dot: { width: 9, height: 9, borderRadius: 3 },
  detailLine: { color: c.muted, fontSize: 12.5, fontFamily: font.bodyMedium, flex: 1 },
  best: {
    backgroundColor: c.surface, borderRadius: radius.md, padding: 14, marginTop: 12,
    borderWidth: 1, borderColor: c.line,
  },
  bestTitleRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  bestTitle: { color: c.ink, fontSize: 13.5, fontFamily: font.semi },
  bestRow: { flexDirection: "row", alignItems: "center", paddingVertical: 4, gap: 9 },
  bestRank: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: c.tealSoft,
    alignItems: "center", justifyContent: "center",
  },
  bestRankText: { color: c.teal, fontSize: 11.5, fontFamily: font.semi },
  bestDate: { color: c.ink, fontSize: 13.5, fontFamily: font.bodySemi, flex: 1 },
  bestMeta: { color: c.muted, fontSize: 12, fontFamily: font.bodyMedium },
  empty: { color: c.faint, fontSize: 12.5, fontFamily: font.body, textAlign: "center", marginTop: 16, lineHeight: 18 },
}));
