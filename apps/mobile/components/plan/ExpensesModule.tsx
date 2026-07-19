import { useCallback, useEffect, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  Modal, Alert, RefreshControl, Keyboard, TouchableWithoutFeedback,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../lib/api";
import { getSocket } from "../../lib/socket";
import { useAuthStore } from "../../hooks/useAuthStore";
import { font, radius, shadow, Palette, themedStyles } from "../../lib/theme";
import { useTheme, useT } from "../../hooks/useSettings";

type Expense = {
  id: string;
  title: string;
  amount: number;
  category: string | null;
  createdAt: string;
  payer: { id: string; name: string | null };
  splits: { userId: string; amount: number; settled: boolean }[];
};

type Summary = {
  mode: string;
  total: number;
  perPerson: number | null;
  headcount: number;
  balances: { userId: string; name: string; isGuest?: boolean; net: number }[];
  transactions: { fromId: string; toId: string; from: string; to: string; amount: number }[];
};

type Member = { rsvp: string; user: { id: string; name: string | null } };

// A person without the app added to this plan just for splitting expenses
type Guest = { id: string; name: string };

export default function ExpensesModule({ planId, members, myRole = "member" }: { planId: string; members: Member[]; myRole?: string }) {
  const c = useTheme();
  const styles = getStyles(c);
  const t = useT();
  const { user } = useAuthStore();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [sharers, setSharers] = useState<Set<string>>(new Set(members.map((m) => m.user.id)));
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [mode, setMode] = useState<"expense" | "equal">("expense");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showGuestInput, setShowGuestInput] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestBusy, setGuestBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [planRes, sumRes, guestsRes] = await Promise.all([
        api.get(`/plans/${planId}`),
        api.get(`/expenses/plan/${planId}/summary?mode=${mode}`),
        api.get(`/expenses/plan/${planId}/guests`),
      ]);
      setExpenses(planRes.data.expenses ?? []);
      setSummary(sumRes.data);
      setGuests(guestsRes.data ?? []);
    } catch { /* noop */ }
  }, [planId, mode]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const socket = getSocket();
    const refresh = () => load();
    socket.on("expense:added", refresh);
    socket.on("expense:removed", refresh);
    return () => {
      socket.off("expense:added", refresh);
      socket.off("expense:removed", refresh);
    };
  }, [load]);

  const toggleSharer = (id: string) => {
    setSharers((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const addExpense = async () => {
    const value = parseFloat(amount.replace(",", "."));
    if (!title.trim() || !Number.isFinite(value) || value <= 0 || sharers.size === 0) return;
    setBusy(true);
    try {
      await api.post(`/expenses/plan/${planId}`, {
        title: title.trim(),
        amount: value,
        splitBetween: [...sharers],
      });
      setTitle("");
      setAmount("");
      setSharers(new Set(members.map((m) => m.user.id)));
      setShowAdd(false);
      await load();
    } catch {
      Alert.alert("Error", "Could not add the expense");
    } finally {
      setBusy(false);
    }
  };

  const deleteExpense = (exp: Expense) => {
    const canDelete = exp.payer.id === user?.id || myRole === "admin";
    if (!canDelete) return;
    Alert.alert(t("ex.deleteQ"), `"${exp.title}" — $${exp.amount.toFixed(2)}`, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"), style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/expenses/${exp.id}`);
            await load();
          } catch { /* noop */ }
        },
      },
    ]);
  };

  const toggleSettled = async (exp: Expense, splitUserId: string, current: boolean) => {
    const canToggle = splitUserId === user?.id || exp.payer.id === user?.id || myRole === "admin";
    if (!canToggle) return;
    try {
      await api.patch(`/expenses/${exp.id}/splits/${splitUserId}`, { settled: !current });
      await load();
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.error ?? "Could not update");
    }
  };

  const addGuest = async () => {
    const clean = guestName.trim();
    if (!clean) return;
    setGuestBusy(true);
    try {
      const res = await api.post(`/expenses/plan/${planId}/guests`, { name: clean });
      setGuests((prev) => [...prev, res.data]);
      setSharers((prev) => new Set(prev).add(res.data.id)); // include them right away
      setGuestName("");
      setShowGuestInput(false);
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.error ?? t("ex.guestFail"));
    } finally {
      setGuestBusy(false);
    }
  };

  const removeGuest = (guest: Guest) => {
    Alert.alert(t("ex.removeGuestQ"), guest.name, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.remove"), style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/expenses/guests/${guest.id}`);
            setGuests((prev) => prev.filter((g) => g.id !== guest.id));
            setSharers((prev) => {
              const next = new Set(prev);
              next.delete(guest.id);
              return next;
            });
          } catch (e: any) {
            Alert.alert("Error", e?.response?.data?.error ?? t("ex.guestFail"));
          }
        },
      },
    ]);
  };

  const memberName = (id: string) =>
    id === user?.id ? t("common.you")
    : members.find((m) => m.user.id === id)?.user.name
    ?? guests.find((g) => g.id === id)?.name
    ?? "?";

  const myNet = summary?.balances.find((b) => b.userId === user?.id)?.net ?? 0;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={c.orange} />}
      >
        {/* Balance header */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>{t("ex.total")}</Text>
          <Text style={styles.balanceTotal}>${(summary?.total ?? 0).toFixed(2)}</Text>
          {mode === "equal" && summary?.perPerson != null && (
            <Text style={styles.perPerson}>
              ${summary.perPerson.toFixed(2)} {t("ex.each")} ({summary.headcount ?? members.length} {t("ex.people")})
            </Text>
          )}
          <Text style={[styles.balanceNet, { color: myNet >= 0 ? c.teal : c.danger }]}>
            {myNet > 0 ? `${t("ex.owed")} $${myNet.toFixed(2)}` :
             myNet < 0 ? `${t("ex.owe")} $${Math.abs(myNet).toFixed(2)}` :
             t("ex.settled")}
          </Text>

          {/* Split mode toggle */}
          <View style={styles.modeRow}>
            <TouchableOpacity
              style={[styles.modeBtn, mode === "expense" && styles.modeBtnActive]}
              onPress={() => setMode("expense")}
            >
              <Text style={[styles.modeText, mode === "expense" && styles.modeTextActive]}>{t("ex.byExpense")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, mode === "equal" && styles.modeBtnActive]}
              onPress={() => setMode("equal")}
            >
              <Text style={[styles.modeText, mode === "equal" && styles.modeTextActive]}>{t("ex.divide")}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Settlement plan */}
        {summary && summary.transactions.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="swap-horizontal-outline" size={15} color={c.ink} />
              <Text style={styles.sectionTitle}>{t("ex.settleUp")}</Text>
            </View>
            {summary.transactions.map((tx, i) => (
              <View key={i} style={styles.txRow}>
                <Text style={styles.txText}>
                  <Text style={{ fontFamily: font.bodyBold, color: tx.fromId === user?.id ? c.danger : c.ink }}>
                    {tx.fromId === user?.id ? t("common.you") : tx.from}
                  </Text>
                  {"  →  "}
                  <Text style={{ fontFamily: font.bodyBold, color: tx.toId === user?.id ? c.teal : c.ink }}>
                    {tx.toId === user?.id ? t("common.you") : tx.to}
                  </Text>
                </Text>
                <Text style={styles.txAmount}>${tx.amount.toFixed(2)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Expense list */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="card-outline" size={15} color={c.ink} />
            <Text style={styles.sectionTitle}>{t("ex.title")}</Text>
          </View>
          {expenses.length === 0 ? (
            <Text style={styles.empty}>{t("ex.empty")}</Text>
          ) : (
            expenses.map((exp) => {
              const isOpen = expanded === exp.id;
              const settledCount = exp.splits.filter((s) => s.settled).length;
              return (
                <View key={exp.id}>
                  <TouchableOpacity
                    style={[styles.expRow, isOpen && styles.expRowOpen]}
                    onPress={() => setExpanded(isOpen ? null : exp.id)}
                    onLongPress={() => deleteExpense(exp)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.expTitle}>{exp.title}</Text>
                      <Text style={styles.expMeta}>
                        {exp.payer.id === user?.id ? t("common.you") : exp.payer.name ?? "?"} {t("ex.paid")} · {settledCount}/{exp.splits.length} {t("ex.paidUp")}
                      </Text>
                    </View>
                    <Text style={styles.expAmount}>${exp.amount.toFixed(2)}</Text>
                    <Ionicons
                      name={isOpen ? "chevron-down" : "chevron-forward"}
                      size={15}
                      color={c.muted}
                      style={{ marginLeft: 10 }}
                    />
                  </TouchableOpacity>

                  {isOpen && (
                    <View style={styles.splitsBox}>
                      {exp.splits.map((s) => {
                        const isPayerShare = s.userId === exp.payer.id;
                        const canToggle = s.userId === user?.id || exp.payer.id === user?.id || myRole === "admin";
                        return (
                          <TouchableOpacity
                            key={s.userId}
                            style={styles.splitRow}
                            onPress={() => !isPayerShare && toggleSettled(exp, s.userId, s.settled)}
                            disabled={isPayerShare || !canToggle}
                          >
                            <Ionicons
                              name={s.settled ? "checkbox" : "square-outline"}
                              size={18}
                              color={s.settled ? c.teal : c.faint}
                              style={{ marginRight: 10 }}
                            />
                            <Text style={[styles.splitName, s.settled && styles.splitSettled]}>
                              {memberName(s.userId)}
                              {isPayerShare ? ` ${t("ex.paidBill")}` : ""}
                            </Text>
                            <Text style={[styles.splitAmount, s.settled && styles.splitSettled]}>
                              ${s.amount.toFixed(2)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                      <Text style={styles.splitsHint}>
                        {t("ex.tapRow")}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>
        <View style={{ height: 90 }} />
      </ScrollView>

      {/* Add button */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowAdd(true)}>
        <View style={styles.fabRow}>
          <Ionicons name="add" size={18} color={c.onOrange} />
          <Text style={styles.fabText}>{t("ex.add")}</Text>
        </View>
      </TouchableOpacity>

      {/* Add expense modal */}
      <Modal visible={showAdd} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View style={styles.modal}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{t("ex.new")}</Text>
                  <TouchableOpacity onPress={() => { Keyboard.dismiss(); setShowAdd(false); }}>
                    <Ionicons name="close" size={22} color={c.muted} />
                  </TouchableOpacity>
                </View>

                <Text style={styles.label}>{t("ex.what")}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t("ex.whatPh")}
                  placeholderTextColor={c.faint}
                  value={title}
                  onChangeText={setTitle}
                  returnKeyType="done"
                />

                <Text style={styles.label}>{t("ex.amount")}</Text>
                <View style={styles.amountRow}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    placeholder="25.50"
                    placeholderTextColor={c.faint}
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="decimal-pad"
                  />
                  <TouchableOpacity style={styles.doneBtn} onPress={Keyboard.dismiss}>
                    <Text style={styles.doneBtnText}>OK</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.label}>{t("ex.split")}</Text>
                <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled">
                  <TouchableOpacity
                    style={[styles.sharerRow, styles.everyoneRow, sharers.size === members.length + guests.length && styles.sharerRowActive]}
                    onPress={() => setSharers(new Set([...members.map((m) => m.user.id), ...guests.map((g) => g.id)]))}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                      <Ionicons name="people" size={15} color={c.teal} />
                      <Text style={[styles.sharerName, { fontFamily: font.bodyBold }]}>{t("ex.everyone")}</Text>
                    </View>
                    <Ionicons
                      name={sharers.size === members.length + guests.length ? "checkbox" : "square-outline"}
                      size={19}
                      color={sharers.size === members.length + guests.length ? c.orange : c.faint}
                    />
                  </TouchableOpacity>
                  {members.map((m) => {
                    const selected = sharers.has(m.user.id);
                    return (
                      <TouchableOpacity
                        key={m.user.id}
                        style={[styles.sharerRow, selected && styles.sharerRowActive]}
                        onPress={() => toggleSharer(m.user.id)}
                      >
                        <Text style={styles.sharerName}>
                          {m.user.id === user?.id ? t("common.you") : m.user.name ?? "?"}
                        </Text>
                        <Ionicons
                          name={selected ? "checkbox" : "square-outline"}
                          size={19}
                          color={selected ? c.orange : c.faint}
                        />
                      </TouchableOpacity>
                    );
                  })}
                  {guests.map((g) => {
                    const selected = sharers.has(g.id);
                    return (
                      <TouchableOpacity
                        key={g.id}
                        style={[styles.sharerRow, selected && styles.sharerRowActive]}
                        onPress={() => toggleSharer(g.id)}
                        onLongPress={() => removeGuest(g)}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 7, flex: 1 }}>
                          <Ionicons name="person-add-outline" size={14} color={c.muted} />
                          <Text style={styles.sharerName}>{g.name}</Text>
                          <Text style={styles.guestTag}>{t("ex.guest")}</Text>
                        </View>
                        <Ionicons
                          name={selected ? "checkbox" : "square-outline"}
                          size={19}
                          color={selected ? c.orange : c.faint}
                        />
                      </TouchableOpacity>
                    );
                  })}

                  {/* Add a person without the app (e.g. Juan) */}
                  {showGuestInput ? (
                    <View style={styles.guestInputRow}>
                      <TextInput
                        style={[styles.input, { flex: 1, marginBottom: 0 }]}
                        placeholder={t("ex.guestPh")}
                        placeholderTextColor={c.faint}
                        value={guestName}
                        onChangeText={setGuestName}
                        autoFocus
                        maxLength={30}
                        returnKeyType="done"
                        onSubmitEditing={addGuest}
                      />
                      <TouchableOpacity
                        style={[styles.doneBtn, (guestBusy || !guestName.trim()) && { opacity: 0.5 }]}
                        onPress={addGuest}
                        disabled={guestBusy || !guestName.trim()}
                      >
                        <Ionicons name="checkmark" size={17} color="#fff" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.guestCancelBtn}
                        onPress={() => { setShowGuestInput(false); setGuestName(""); }}
                      >
                        <Ionicons name="close" size={17} color={c.muted} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={styles.addGuestRow} onPress={() => setShowGuestInput(true)}>
                      <Ionicons name="person-add-outline" size={15} color={c.teal} />
                      <Text style={styles.addGuestText}>{t("ex.addGuest")}</Text>
                    </TouchableOpacity>
                  )}
                  {guests.length > 0 && (
                    <Text style={styles.guestHint}>{t("ex.guestHint")}</Text>
                  )}
                </ScrollView>

                <TouchableOpacity
                  style={[styles.button, busy && { opacity: 0.5 }]}
                  onPress={addExpense}
                  disabled={busy}
                >
                  <Text style={styles.buttonText}>{busy ? "..." : t("ex.add")}</Text>
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
  container: { flex: 1, padding: 12 },
  balanceCard: {
    backgroundColor: c.petrol, borderRadius: radius.lg, padding: 20,
    alignItems: "center", marginBottom: 12, ...shadow.card,
  },
  balanceLabel: { color: "#8FB0C0", fontSize: 12.5, fontFamily: font.bodyMedium },
  balanceTotal: { color: "#FFFFFF", fontSize: 32, fontFamily: font.title, marginVertical: 4 },
  balanceNet: { fontSize: 14, fontFamily: font.semi },
  section: { marginBottom: 12 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  sectionTitle: { color: c.ink, fontSize: 15, fontFamily: font.semi },
  txRow: {
    flexDirection: "row", justifyContent: "space-between", backgroundColor: c.surface,
    borderRadius: radius.md, padding: 14, marginBottom: 6, borderWidth: 1, borderColor: c.line,
  },
  txText: { color: c.ink, fontSize: 13.5, fontFamily: font.bodyMedium },
  txAmount: { color: c.ink, fontSize: 13.5, fontFamily: font.bodyBold },
  empty: { color: c.faint, fontSize: 13.5, fontFamily: font.body, textAlign: "center", marginTop: 12 },
  expRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: c.surface,
    borderRadius: radius.md, padding: 14, marginBottom: 6, borderWidth: 1, borderColor: c.line,
  },
  expRowOpen: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, marginBottom: 0, borderBottomWidth: 0 },
  expTitle: { color: c.ink, fontSize: 14.5, fontFamily: font.bodySemi },
  expMeta: { color: c.muted, fontSize: 11.5, fontFamily: font.body, marginTop: 2 },
  expAmount: { color: c.ink, fontSize: 15.5, fontFamily: font.title },
  splitsBox: {
    backgroundColor: c.surface2, borderBottomLeftRadius: radius.md, borderBottomRightRadius: radius.md,
    padding: 12, marginBottom: 6, borderWidth: 1, borderTopWidth: 0, borderColor: c.line,
  },
  splitRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  splitName: { flex: 1, color: c.ink, fontSize: 13.5, fontFamily: font.bodyMedium },
  splitAmount: { color: c.ink, fontSize: 13.5, fontFamily: font.bodyBold },
  splitSettled: { color: c.faint, textDecorationLine: "line-through" },
  splitsHint: { color: c.faint, fontSize: 11, fontFamily: font.body, textAlign: "center", marginTop: 6 },
  perPerson: { color: "#7FD1DC", fontSize: 13, fontFamily: font.bodySemi, marginBottom: 4 },
  modeRow: { flexDirection: "row", gap: 8, marginTop: 14, alignSelf: "stretch" },
  modeBtn: {
    flex: 1, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: radius.sm,
    paddingVertical: 8, alignItems: "center", borderWidth: 1.5, borderColor: "transparent",
  },
  modeBtnActive: { borderColor: c.orange, backgroundColor: "rgba(247,127,0,0.18)" },
  modeText: { color: "#8FB0C0", fontSize: 11.5, fontFamily: font.semi },
  modeTextActive: { color: "#FFFFFF" },
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
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { color: c.ink, fontSize: 19, fontFamily: font.title },
  label: { color: c.ink, fontSize: 13, fontFamily: font.bodySemi, marginBottom: 8 },
  input: {
    backgroundColor: c.surface, borderRadius: radius.md, padding: 14, color: c.ink,
    fontSize: 15, fontFamily: font.bodyMedium, marginBottom: 14, borderWidth: 1, borderColor: c.line,
  },
  sharerRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: c.surface, borderRadius: radius.md, padding: 12, marginBottom: 6,
    borderWidth: 1.5, borderColor: c.line,
  },
  sharerRowActive: { borderColor: c.orange },
  everyoneRow: { backgroundColor: c.tealSoft },
  amountRow: { flexDirection: "row", gap: 8, marginBottom: 14, alignItems: "center" },
  doneBtn: { backgroundColor: c.teal, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 14 },
  doneBtnText: { color: "#fff", fontFamily: font.semi, fontSize: 14 },
  sharerName: { color: c.ink, fontSize: 14, fontFamily: font.bodyMedium },
  guestTag: {
    color: c.muted, fontSize: 10.5, fontFamily: font.bodySemi,
    backgroundColor: c.surface2, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
    overflow: "hidden",
  },
  guestInputRow: { flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 6 },
  guestCancelBtn: {
    borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 13,
    borderWidth: 1, borderColor: c.line, backgroundColor: c.surface,
  },
  addGuestRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7,
    borderRadius: radius.md, padding: 12, marginBottom: 6,
    borderWidth: 1.5, borderColor: c.line, borderStyle: "dashed",
  },
  addGuestText: { color: c.teal, fontSize: 13.5, fontFamily: font.bodySemi },
  guestHint: { color: c.faint, fontSize: 11, fontFamily: font.body, textAlign: "center", marginTop: 2, marginBottom: 4 },
  button: {
    backgroundColor: c.orange, borderRadius: radius.lg, padding: 16,
    alignItems: "center", marginTop: 12, ...shadow.orange,
  },
  buttonText: { color: c.onOrange, fontSize: 15, fontFamily: font.semi },
}));
