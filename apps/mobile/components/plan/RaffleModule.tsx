import { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  Modal, Alert, RefreshControl, Animated, Easing, Keyboard,
  KeyboardAvoidingView, Platform, TouchableWithoutFeedback,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { G, Path, Circle, Text as SvgText } from "react-native-svg";
import { api } from "../../lib/api";
import { getSocket } from "../../lib/socket";
import { useAuthStore } from "../../hooks/useAuthStore";
import { font, radius, shadow, Palette, themedStyles } from "../../lib/theme";
import { useTheme, useT } from "../../hooks/useSettings";

type Participant = { id: string; name: string };

type Raffle = {
  id: string;
  title: string;
  participants: Participant[];
  winnerId: string | null;
  winnerName: string | null;
  spunAt: string | null;
};

type Member = { rsvp: string; user: { id: string; name: string | null } };
type Guest = { id: string; name: string };

// Brand hues that read well on both themes; cycled around the wheel
const WHEEL_COLORS = ["#F77F00", "#0892A5", "#0B3954", "#F9A94A", "#12B5C4", "#155E80"];

const SIZE = 300;
const CX = SIZE / 2;
const R = SIZE / 2 - 10;

// angle 0 = top of the wheel, growing clockwise
function polar(angleDeg: number, r: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CX + r * Math.cos(a), y: CX + r * Math.sin(a) };
}

function arcPath(start: number, end: number) {
  const a = polar(start, R);
  const b = polar(end, R);
  const large = end - start > 180 ? 1 : 0;
  return `M ${CX} ${CX} L ${a.x} ${a.y} A ${R} ${R} 0 ${large} 1 ${b.x} ${b.y} Z`;
}

function segmentColor(i: number, total: number): string {
  let color = WHEEL_COLORS[i % WHEEL_COLORS.length]!;
  // avoid the last segment matching the first (they sit next to each other)
  if (i === total - 1 && total > 2 && color === WHEEL_COLORS[0]) {
    color = WHEEL_COLORS[1]!;
  }
  return color;
}

export default function RaffleModule({
  planId, members, myRole = "member",
}: { planId: string; members: Member[]; myRole?: string }) {
  const c = useTheme();
  const styles = getStyles(c);
  const t = useT();
  const { user } = useAuthStore();
  const canManage = myRole === "admin" || myRole === "helper";

  const [raffles, setRaffles] = useState<Raffle[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Wheel modal
  const [open, setOpen] = useState<Raffle | null>(null);
  const [winner, setWinner] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);
  const spinningRef = useRef(false);
  const rotation = useRef(new Animated.Value(0)).current;
  const rotationValue = useRef(0);

  // Create / edit form
  const [form, setForm] = useState<"new" | Raffle | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formIds, setFormIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sub = rotation.addListener(({ value }) => { rotationValue.current = value; });
    return () => rotation.removeListener(sub);
  }, [rotation]);

  const load = useCallback(async () => {
    try {
      const [rafflesRes, guestsRes] = await Promise.all([
        api.get(`/raffles/plan/${planId}`),
        api.get(`/expenses/plan/${planId}/guests`),
      ]);
      setRaffles(rafflesRes.data);
      setGuests(guestsRes.data ?? []);
    } catch { /* noop */ }
  }, [planId]);

  useEffect(() => { load(); }, [load]);

  const animateTo = useCallback((winnerIndex: number, participants: Participant[], name: string) => {
    const seg = 360 / participants.length;
    const center = winnerIndex * seg + seg / 2;
    const jitter = (Math.random() - 0.5) * seg * 0.6; // land off-center, feels real
    const current = rotationValue.current % 360;
    rotation.setValue(current);
    const target = current + 360 * 5 + ((360 - center - current % 360 + 720) % 360) + jitter;

    spinningRef.current = true;
    setSpinning(true);
    setWinner(null);
    Animated.timing(rotation, {
      toValue: target,
      duration: 4200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      spinningRef.current = false;
      setSpinning(false);
      setWinner(name);
    });
  }, [rotation]);

  useEffect(() => {
    const socket = getSocket();
    const onChanged = () => load();
    const onSpun = (data: { raffleId: string; winnerIndex: number; winnerName: string }) => {
      setRaffles((prev) => prev.map((r) =>
        r.id === data.raffleId ? { ...r, winnerName: data.winnerName } : r
      ));
      // If I'm watching this wheel and didn't trigger the spin myself, run the show
      setOpen((cur) => {
        if (cur && cur.id === data.raffleId && !spinningRef.current) {
          animateTo(data.winnerIndex, cur.participants, data.winnerName);
        }
        return cur;
      });
    };
    socket.on("raffle:changed", onChanged);
    socket.on("raffle:spun", onSpun);
    return () => {
      socket.off("raffle:changed", onChanged);
      socket.off("raffle:spun", onSpun);
    };
  }, [load, animateTo]);

  const openRaffle = (raffle: Raffle) => {
    rotation.setValue(0);
    rotationValue.current = 0;
    setWinner(raffle.winnerName);
    setOpen(raffle);
  };

  const spin = async () => {
    if (!open || spinningRef.current) return;
    try {
      const res = await api.post(`/raffles/${open.id}/spin`);
      animateTo(res.data.winnerIndex, open.participants, res.data.winnerName);
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.error ?? t("rf.fail"));
    }
  };

  const deleteRaffle = (raffle: Raffle) => {
    if (!canManage) return;
    Alert.alert(t("rf.deleteQ"), raffle.title, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"), style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/raffles/${raffle.id}`);
            setOpen((cur) => (cur?.id === raffle.id ? null : cur));
            await load();
          } catch { /* noop */ }
        },
      },
    ]);
  };

  // ----- create / edit form -----

  const pickerOptions: { id: string; name: string; isGuest: boolean }[] = [
    ...members.map((m) => ({ id: m.user.id, name: m.user.name ?? "?", isGuest: false })),
    ...guests.map((g) => ({ id: g.id, name: g.name, isGuest: true })),
  ];

  const startCreate = () => {
    setFormTitle("");
    setFormIds(new Set(members.map((m) => m.user.id)));
    setForm("new");
  };

  const startEdit = (raffle: Raffle) => {
    setFormTitle(raffle.title);
    setFormIds(new Set(raffle.participants.map((p) => p.id)));
    setForm(raffle);
  };

  const toggleFormId = (id: string) => {
    setFormIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const submitForm = async () => {
    const participants = pickerOptions.filter((o) => formIds.has(o.id))
      .map((o) => ({ id: o.id, name: o.name }));
    if (!formTitle.trim() || participants.length < 2) return;
    setBusy(true);
    try {
      if (form === "new") {
        await api.post(`/raffles/plan/${planId}`, { title: formTitle.trim(), participants });
      } else if (form) {
        const res = await api.patch(`/raffles/${form.id}`, { title: formTitle.trim(), participants });
        setOpen((cur) => (cur?.id === form.id ? res.data : cur));
        setWinner(null);
        rotation.setValue(0);
        rotationValue.current = 0;
      }
      setForm(null);
      await load();
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.error ?? t("rf.fail"));
    } finally {
      setBusy(false);
    }
  };

  // ----- wheel drawing -----

  const renderWheel = (participants: Participant[]) => {
    const n = participants.length;
    const seg = 360 / n;
    const labelSize = n <= 5 ? 15 : n <= 8 ? 13 : n <= 12 ? 11 : 9;
    const spin360 = rotation.interpolate({ inputRange: [0, 360], outputRange: ["0deg", "360deg"] });
    return (
      <View style={styles.wheelWrap}>
        <Animated.View style={{ width: SIZE, height: SIZE, transform: [{ rotate: spin360 }] }}>
          <Svg width={SIZE} height={SIZE}>
            {participants.map((p, i) => {
              const start = i * seg;
              const mid = start + seg / 2;
              const pos = polar(mid, R * 0.62);
              return (
                <G key={p.id}>
                  <Path d={arcPath(start, start + seg)} fill={segmentColor(i, n)} stroke={c.bg} strokeWidth={2} />
                  <SvgText
                    x={pos.x}
                    y={pos.y}
                    fill="#FFFFFF"
                    fontSize={labelSize}
                    fontWeight="700"
                    textAnchor="middle"
                    alignmentBaseline="middle"
                    transform={`rotate(${mid}, ${pos.x}, ${pos.y})`}
                  >
                    {p.name.length > 10 ? `${p.name.slice(0, 9)}…` : p.name}
                  </SvgText>
                </G>
              );
            })}
            <Circle cx={CX} cy={CX} r={26} fill={c.bg} />
            <Circle cx={CX} cy={CX} r={26} fill="none" stroke={c.orange} strokeWidth={3} />
          </Svg>
        </Animated.View>
        {/* pointer */}
        <View style={styles.pointer} />
      </View>
    );
  };

  const formValid = formTitle.trim().length > 0 && formIds.size >= 2;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1, padding: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={c.orange} />}
      >
        {raffles.length === 0 && (
          <View style={styles.empty}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="disc-outline" size={38} color={c.teal} />
            </View>
            <Text style={styles.emptyText}>{t("rf.empty")}</Text>
            <Text style={styles.emptySub}>{canManage ? t("rf.emptySub") : t("rf.emptySubMember")}</Text>
          </View>
        )}
        {raffles.map((raffle) => (
          <TouchableOpacity
            key={raffle.id}
            style={styles.card}
            onPress={() => openRaffle(raffle)}
            onLongPress={() => deleteRaffle(raffle)}
          >
            <View style={styles.cardIcon}>
              <Ionicons name="disc-outline" size={22} color={c.orange} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle} numberOfLines={1}>{raffle.title}</Text>
              <Text style={styles.cardMeta}>
                {raffle.participants.length} {t("rf.people")}
                {raffle.winnerName ? ` · ${t("rf.lastWinner")}: ${raffle.winnerName}` : ""}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={c.muted} />
          </TouchableOpacity>
        ))}
        <View style={{ height: 90 }} />
      </ScrollView>

      {canManage && (
        <TouchableOpacity style={styles.fab} onPress={startCreate}>
          <View style={styles.fabRow}>
            <Ionicons name="add" size={18} color={c.onOrange} />
            <Text style={styles.fabText}>{t("rf.new")}</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Wheel modal */}
      <Modal visible={!!open} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>{open?.title}</Text>
              <View style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
                {canManage && open && (
                  <TouchableOpacity onPress={() => startEdit(open)}>
                    <Ionicons name="create-outline" size={21} color={c.teal} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setOpen(null)}>
                  <Ionicons name="close" size={22} color={c.muted} />
                </TouchableOpacity>
              </View>
            </View>

            {open && renderWheel(open.participants)}

            <View style={styles.resultBox}>
              {winner ? (
                <>
                  <Text style={styles.winnerLabel}>{t("rf.winner")}</Text>
                  <Text style={styles.winnerName}>{winner}</Text>
                </>
              ) : (
                <Text style={styles.resultHint}>
                  {spinning ? t("rf.spinning") : canManage ? t("rf.hint") : t("rf.hintMember")}
                </Text>
              )}
            </View>

            {canManage && (
              <TouchableOpacity
                style={[styles.spinBtn, spinning && { opacity: 0.5 }]}
                onPress={spin}
                disabled={spinning}
              >
                <View style={styles.fabRow}>
                  <Ionicons name="sync-outline" size={18} color={c.onOrange} />
                  <Text style={styles.fabText}>{spinning ? t("rf.spinning") : t("rf.spin")}</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* Create / edit modal */}
      <Modal visible={!!form} animationType="slide" transparent>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View style={styles.modal}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{form === "new" ? t("rf.new") : t("rf.edit")}</Text>
                  <TouchableOpacity onPress={() => setForm(null)}>
                    <Ionicons name="close" size={22} color={c.muted} />
                  </TouchableOpacity>
                </View>

                <Text style={styles.label}>{t("rf.titleLabel")}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t("rf.titlePh")}
                  placeholderTextColor={c.faint}
                  value={formTitle}
                  onChangeText={setFormTitle}
                  maxLength={60}
                  returnKeyType="done"
                />

                <Text style={styles.label}>{t("rf.participants")}</Text>
                <ScrollView style={{ maxHeight: 250 }} keyboardShouldPersistTaps="handled">
                  {pickerOptions.map((o) => {
                    const selected = formIds.has(o.id);
                    return (
                      <TouchableOpacity
                        key={o.id}
                        style={[styles.pickRow, selected && styles.pickRowActive]}
                        onPress={() => toggleFormId(o.id)}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 7, flex: 1 }}>
                          {o.isGuest && <Ionicons name="person-add-outline" size={14} color={c.muted} />}
                          <Text style={styles.pickName}>
                            {o.id === user?.id ? t("common.you") : o.name}
                          </Text>
                          {o.isGuest && <Text style={styles.guestTag}>{t("ex.guest")}</Text>}
                        </View>
                        <Ionicons
                          name={selected ? "checkbox" : "square-outline"}
                          size={19}
                          color={selected ? c.orange : c.faint}
                        />
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                <Text style={styles.formHint}>
                  {form !== "new" ? t("rf.editHint") : t("rf.needTwo")}
                </Text>

                <TouchableOpacity
                  style={[styles.spinBtn, (!formValid || busy) && { opacity: 0.5 }]}
                  onPress={submitForm}
                  disabled={!formValid || busy}
                >
                  <Text style={styles.fabText}>
                    {busy ? "..." : form === "new" ? t("rf.create") : t("rf.save")}
                  </Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const getStyles = themedStyles((c: Palette) => StyleSheet.create({
  empty: { alignItems: "center", marginTop: 70 },
  emptyIconWrap: {
    width: 84, height: 84, borderRadius: 26, backgroundColor: c.tealSoft,
    alignItems: "center", justifyContent: "center",
  },
  emptyText: { color: c.ink, fontSize: 19, fontFamily: font.title, marginTop: 16 },
  emptySub: {
    color: c.muted, fontSize: 13.5, fontFamily: font.bodyMedium, marginTop: 8,
    textAlign: "center", paddingHorizontal: 30,
  },
  card: {
    flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.surface,
    borderRadius: radius.md, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: c.line,
  },
  cardIcon: {
    width: 42, height: 42, borderRadius: 13, backgroundColor: c.orangeSoft,
    alignItems: "center", justifyContent: "center",
  },
  cardTitle: { color: c.ink, fontSize: 15, fontFamily: font.bodySemi },
  cardMeta: { color: c.muted, fontSize: 12, fontFamily: font.body, marginTop: 2 },
  fab: {
    position: "absolute", bottom: 20, right: 16, left: 16, backgroundColor: c.orange,
    borderRadius: radius.lg, padding: 16, alignItems: "center", ...shadow.orange,
  },
  fabRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  fabText: { color: c.onOrange, fontSize: 15, fontFamily: font.semi },
  modalOverlay: { flex: 1, backgroundColor: "rgba(7,32,48,0.55)", justifyContent: "flex-end" },
  modal: {
    backgroundColor: c.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 40,
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  modalTitle: { color: c.ink, fontSize: 19, fontFamily: font.title, flex: 1, marginRight: 12 },
  wheelWrap: { alignItems: "center", marginVertical: 8 },
  pointer: {
    position: "absolute", top: -4, alignSelf: "center",
    width: 0, height: 0, borderLeftWidth: 13, borderRightWidth: 13, borderTopWidth: 22,
    borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: c.orange,
    // subtle outline so it pops on any segment color
    shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 2, shadowOffset: { width: 0, height: 1 },
  },
  resultBox: { alignItems: "center", minHeight: 58, justifyContent: "center", marginTop: 6 },
  winnerLabel: { color: c.muted, fontSize: 12.5, fontFamily: font.bodyMedium },
  winnerName: { color: c.orange, fontSize: 26, fontFamily: font.title, marginTop: 2 },
  resultHint: { color: c.faint, fontSize: 13, fontFamily: font.bodyMedium, textAlign: "center" },
  spinBtn: {
    backgroundColor: c.orange, borderRadius: radius.lg, padding: 16,
    alignItems: "center", marginTop: 10, ...shadow.orange,
  },
  label: { color: c.ink, fontSize: 13, fontFamily: font.bodySemi, marginBottom: 8 },
  input: {
    backgroundColor: c.surface, borderRadius: radius.md, padding: 14, color: c.ink,
    fontSize: 14.5, fontFamily: font.bodyMedium, marginBottom: 14, borderWidth: 1, borderColor: c.line,
  },
  pickRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: c.surface, borderRadius: radius.md, padding: 12, marginBottom: 6,
    borderWidth: 1.5, borderColor: c.line,
  },
  pickRowActive: { borderColor: c.orange },
  pickName: { color: c.ink, fontSize: 14, fontFamily: font.bodyMedium },
  guestTag: {
    color: c.muted, fontSize: 10.5, fontFamily: font.bodySemi,
    backgroundColor: c.surface2, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
    overflow: "hidden",
  },
  formHint: { color: c.faint, fontSize: 11.5, fontFamily: font.body, textAlign: "center", marginTop: 6 },
}));
