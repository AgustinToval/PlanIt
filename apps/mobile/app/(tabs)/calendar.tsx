import { useCallback, useMemo, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../lib/api";
import { useSettings, useTheme, useT } from "../../hooks/useSettings";
import { font, radius, shadow, Palette } from "../../lib/theme";

type Plan = {
  id: string;
  title: string;
  type: string;
  startDate: string | null;
  location: string | null;
};

type AvailEntry = { date: string; status: string };

const MONTHS: Record<string, string[]> = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  es: ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"],
};
const WEEKDAYS: Record<string, string[]> = {
  en: ["M", "T", "W", "T", "F", "S", "S"],
  es: ["L", "M", "X", "J", "V", "S", "D"],
};

function ymd(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const AVAIL_COLORS: Record<string, string> = {
  free: "#0892A5",
  maybe: "#F0A72B",
  busy: "#E05252",
};

const CYCLE: Record<string, string> = {
  none: "free",
  free: "maybe",
  maybe: "busy",
  busy: "none",
};

export default function CalendarScreen() {
  const router = useRouter();
  const c = useTheme();
  const t = useT();
  const lang = useSettings((s) => s.lang);
  const locale = lang === "es" ? "es-ES" : "en-GB";
  const styles = useMemo(() => makeStyles(c), [c]);
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-based
  const [plans, setPlans] = useState<Plan[]>([]);
  const [avail, setAvail] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<"plans" | "availability">("plans");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const AVAIL_LABELS: Record<string, string> = {
    free: t("cal.free"),
    maybe: t("cal.maybe"),
    busy: t("cal.busy"),
  };

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
        <Text style={styles.title}>{t("cal.title")}</Text>
      </View>

      {/* Mode toggle */}
      <View style={styles.modeRow}>
        <TouchableOpacity
          style={[styles.modeBtn, mode === "plans" && styles.modeBtnActive]}
          onPress={() => setMode("plans")}
        >
          <Ionicons name="calendar-outline" size={14} color={mode === "plans" ? c.onOrange : c.muted} />
          <Text style={[styles.modeText, mode === "plans" && styles.modeTextActive]}>{t("cal.myPlans")}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, mode === "availability" && styles.modeBtnActive]}
          onPress={() => { setSelectedDay(null); setMode("availability"); }}
        >
          <Ionicons name="time-outline" size={14} color={mode === "availability" ? c.onOrange : c.muted} />
          <Text style={[styles.modeText, mode === "availability" && styles.modeTextActive]}>{t("cal.myAvail")}</Text>
        </TouchableOpacity>
      </View>

      {/* Month nav */}
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={prevMonth} style={styles.navBtn}>
          <Ionicons name="chevron-back" size={20} color={c.teal} />
        </TouchableOpacity>
        <Text style={styles.monthTitle}>{MONTHS[lang]![month]} {year}</Text>
        <TouchableOpacity onPress={nextMonth} style={styles.navBtn}>
          <Ionicons name="chevron-forward" size={20} color={c.teal} />
        </TouchableOpacity>
      </View>

      {/* Weekday header */}
      <View style={styles.weekRow}>
        {WEEKDAYS[lang]!.map((w, i) => (
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
                  ? { backgroundColor: `${AVAIL_COLORS[availStatus]}22`, borderColor: AVAIL_COLORS[availStatus], borderWidth: 1.5 }
                  : null,
              ]}
              onPress={() => onDayPress(key)}
            >
              <Text style={[
                styles.cellText,
                isToday && styles.cellTextToday,
                isSelected && styles.cellTextSelected,
              ]}>{day}</Text>
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
          <Text style={styles.legendText}>{t("cal.tapCycle")}</Text>
          <View style={styles.legendRow}>
            {(["free", "maybe", "busy"] as const).map((s) => (
              <View key={s} style={styles.legendItem}>
                <View style={[styles.legendSwatch, { backgroundColor: AVAIL_COLORS[s] }]} />
                <Text style={styles.legendText}>{AVAIL_LABELS[s]}</Text>
              </View>
            ))}
            <Text style={styles.legendText}>{t("cal.clear")}</Text>
          </View>
          <Text style={styles.legendHint}>{t("cal.availHint")}</Text>
        </View>
      ) : (
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: c.orange }]} />
            <Text style={styles.legendText}>{t("cal.daysWithPlans")}</Text>
          </View>
        </View>
      )}

      {/* Selected day plans */}
      {mode === "plans" && selectedDay && (
        <View style={{ paddingHorizontal: 16 }}>
          <Text style={styles.dayTitle}>
            {new Date(`${selectedDay}T12:00:00`).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })}
          </Text>
          {dayPlans.length === 0 ? (
            <Text style={styles.dayEmpty}>{t("cal.noPlansDay")}</Text>
          ) : (
            dayPlans.map((p) => (
              <TouchableOpacity key={p.id} style={styles.dayPlan} onPress={() => router.push(`/plan/${p.id}`)}>
                <View style={styles.dayPlanTitleRow}>
                  <Ionicons
                    name={p.type === "quick" ? "flash" : "calendar-clear-outline"}
                    size={14}
                    color={p.type === "quick" ? c.orange : c.teal}
                  />
                  <Text style={styles.dayPlanTitle}>{p.title}</Text>
                </View>
                {p.startDate && (
                  <Text style={styles.dayPlanMeta}>
                    {new Date(p.startDate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    {p.location ? `  ·  ${p.location}` : ""}
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

const makeStyles = (c: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  header: { padding: 20, paddingTop: 60, paddingBottom: 12 },
  title: { fontSize: 25, fontFamily: font.title, color: c.ink, letterSpacing: -0.5 },
  modeRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginBottom: 14 },
  modeBtn: {
    flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6,
    backgroundColor: c.surface, borderRadius: radius.md, paddingVertical: 10,
    borderWidth: 1, borderColor: c.line,
  },
  modeBtnActive: { backgroundColor: c.orange, borderColor: c.orange, ...shadow.orange },
  modeText: { color: c.muted, fontSize: 12.5, fontFamily: font.semi },
  modeTextActive: { color: c.onOrange },
  monthNav: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, marginBottom: 10,
  },
  navBtn: {
    backgroundColor: c.surface, borderRadius: radius.md, width: 40, height: 40,
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.line,
  },
  monthTitle: { color: c.ink, fontSize: 17, fontFamily: font.semi, letterSpacing: -0.2 },
  weekRow: { flexDirection: "row", paddingHorizontal: 12, marginBottom: 4 },
  weekday: { flex: 1, textAlign: "center", color: c.faint, fontSize: 11, fontFamily: font.semi },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12 },
  cell: {
    width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center",
    borderRadius: radius.md,
  },
  cellToday: { backgroundColor: c.tealSoft },
  cellSelected: { backgroundColor: c.orange },
  cellText: { color: c.ink, fontSize: 14, fontFamily: font.bodyMedium },
  cellTextToday: { fontFamily: font.bodyBold, color: c.teal },
  cellTextSelected: { color: c.onOrange, fontFamily: font.bodyBold },
  planDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.orange, marginTop: 3 },
  availDot: { width: 6, height: 6, borderRadius: 3, marginTop: 3 },
  legend: {
    backgroundColor: c.surface, borderRadius: radius.md, padding: 14, margin: 16,
    alignItems: "center", borderWidth: 1, borderColor: c.line,
  },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 6 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendSwatch: { width: 10, height: 10, borderRadius: 3 },
  legendText: { color: c.muted, fontSize: 12.5, fontFamily: font.bodyMedium },
  legendHint: { color: c.faint, fontSize: 12, fontFamily: font.body, marginTop: 8, textAlign: "center" },
  dayTitle: { color: c.ink, fontSize: 16, fontFamily: font.semi, marginBottom: 10, letterSpacing: -0.2 },
  dayEmpty: { color: c.faint, fontSize: 13.5, fontFamily: font.body },
  dayPlan: {
    backgroundColor: c.surface, borderRadius: radius.md, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: c.line, ...shadow.card,
  },
  dayPlanTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  dayPlanTitle: { color: c.ink, fontSize: 14.5, fontFamily: font.bodySemi },
  dayPlanMeta: { color: c.muted, fontSize: 12.5, fontFamily: font.bodyMedium, marginTop: 3 },
});
