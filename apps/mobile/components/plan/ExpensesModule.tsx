import { useCallback, useEffect, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  Modal, Alert, RefreshControl, Keyboard, TouchableWithoutFeedback,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { api } from "../../lib/api";
import { getSocket } from "../../lib/socket";
import { useAuthStore } from "../../hooks/useAuthStore";

type Expense = {
  id: string;
  title: string;
  amount: number;
  category: string | null;
  createdAt: string;
  payer: { id: string; name: string | null };
  splits: { userId: string; amount: number }[];
};

type Summary = {
  total: number;
  balances: { userId: string; name: string; net: number }[];
  transactions: { fromId: string; toId: string; from: string; to: string; amount: number }[];
};

type Member = { rsvp: string; user: { id: string; name: string | null } };

export default function ExpensesModule({ planId, members, myRole = "member" }: { planId: string; members: Member[]; myRole?: string }) {
  const { user } = useAuthStore();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [sharers, setSharers] = useState<Set<string>>(new Set(members.map((m) => m.user.id)));
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [planRes, sumRes] = await Promise.all([
        api.get(`/plans/${planId}`),
        api.get(`/expenses/plan/${planId}/summary`),
      ]);
      setExpenses(planRes.data.expenses ?? []);
      setSummary(sumRes.data);
    } catch { /* noop */ }
  }, [planId]);

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
    Alert.alert("Delete expense?", `"${exp.title}" — $${exp.amount.toFixed(2)}`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/expenses/${exp.id}`);
            await load();
          } catch { /* noop */ }
        },
      },
    ]);
  };

  const myNet = summary?.balances.find((b) => b.userId === user?.id)?.net ?? 0;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor="#6366f1" />}
      >
        {/* Balance header */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Total spent</Text>
          <Text style={styles.balanceTotal}>${(summary?.total ?? 0).toFixed(2)}</Text>
          <Text style={[styles.balanceNet, { color: myNet >= 0 ? "#22c55e" : "#f87171" }]}>
            {myNet > 0 ? `You are owed $${myNet.toFixed(2)}` :
             myNet < 0 ? `You owe $${Math.abs(myNet).toFixed(2)}` :
             "You're all settled ✓"}
          </Text>
        </View>

        {/* Settlement plan */}
        {summary && summary.transactions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>💡 Settle up</Text>
            {summary.transactions.map((t, i) => (
              <View key={i} style={styles.txRow}>
                <Text style={styles.txText}>
                  <Text style={{ fontWeight: "700", color: t.fromId === user?.id ? "#f87171" : "#e2e8f0" }}>
                    {t.fromId === user?.id ? "You" : t.from}
                  </Text>
                  {"  →  "}
                  <Text style={{ fontWeight: "700", color: t.toId === user?.id ? "#22c55e" : "#e2e8f0" }}>
                    {t.toId === user?.id ? "You" : t.to}
                  </Text>
                </Text>
                <Text style={styles.txAmount}>${t.amount.toFixed(2)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Expense list */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Expenses</Text>
          {expenses.length === 0 ? (
            <Text style={styles.empty}>No expenses yet — add the first one</Text>
          ) : (
            expenses.map((exp) => (
              <TouchableOpacity
                key={exp.id}
                style={styles.expRow}
                onLongPress={() => deleteExpense(exp)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.expTitle}>{exp.title}</Text>
                  <Text style={styles.expMeta}>
                    {exp.payer.id === user?.id ? "You" : exp.payer.name ?? "?"} paid · split {exp.splits.length} ways
                  </Text>
                </View>
                <Text style={styles.expAmount}>${exp.amount.toFixed(2)}</Text>
              </TouchableOpacity>
            ))
          )}
        </View>
        <View style={{ height: 90 }} />
      </ScrollView>

      {/* Add button */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowAdd(true)}>
        <Text style={styles.fabText}>＋ Add expense</Text>
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
                  <Text style={styles.modalTitle}>New expense</Text>
                  <TouchableOpacity onPress={() => { Keyboard.dismiss(); setShowAdd(false); }}>
                    <Text style={styles.modalClose}>✕</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.label}>What was it?</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Firewood, dinner, gas..."
                  placeholderTextColor="#475569"
                  value={title}
                  onChangeText={setTitle}
                  returnKeyType="done"
                />

                <Text style={styles.label}>Amount</Text>
                <View style={styles.amountRow}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    placeholder="25.50"
                    placeholderTextColor="#475569"
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="decimal-pad"
                  />
                  <TouchableOpacity style={styles.doneBtn} onPress={Keyboard.dismiss}>
                    <Text style={styles.doneBtnText}>OK</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.label}>Split between</Text>
                <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled">
                  <TouchableOpacity
                    style={[styles.sharerRow, styles.everyoneRow, sharers.size === members.length && styles.sharerRowActive]}
                    onPress={() => setSharers(new Set(members.map((m) => m.user.id)))}
                  >
                    <Text style={[styles.sharerName, { fontWeight: "700" }]}>👥 Everyone</Text>
                    <Text>{sharers.size === members.length ? "✅" : "⬜"}</Text>
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
                          {m.user.id === user?.id ? "You" : m.user.name ?? "?"}
                        </Text>
                        <Text>{selected ? "✅" : "⬜"}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <TouchableOpacity
                  style={[styles.button, busy && { opacity: 0.5 }]}
                  onPress={addExpense}
                  disabled={busy}
                >
                  <Text style={styles.buttonText}>{busy ? "..." : "Add expense"}</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12 },
  balanceCard: { backgroundColor: "#1e293b", borderRadius: 16, padding: 20, alignItems: "center", marginBottom: 12 },
  balanceLabel: { color: "#64748b", fontSize: 13 },
  balanceTotal: { color: "#ffffff", fontSize: 34, fontWeight: "800", marginVertical: 4 },
  balanceNet: { fontSize: 15, fontWeight: "700" },
  section: { marginBottom: 12 },
  sectionTitle: { color: "#ffffff", fontSize: 16, fontWeight: "700", marginBottom: 8 },
  txRow: { flexDirection: "row", justifyContent: "space-between", backgroundColor: "#1e293b", borderRadius: 12, padding: 14, marginBottom: 6 },
  txText: { color: "#e2e8f0", fontSize: 14 },
  txAmount: { color: "#ffffff", fontSize: 14, fontWeight: "700" },
  empty: { color: "#475569", fontSize: 14, textAlign: "center", marginTop: 12 },
  expRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#1e293b", borderRadius: 12, padding: 14, marginBottom: 6 },
  expTitle: { color: "#ffffff", fontSize: 15, fontWeight: "600" },
  expMeta: { color: "#64748b", fontSize: 12, marginTop: 2 },
  expAmount: { color: "#ffffff", fontSize: 16, fontWeight: "800" },
  fab: { position: "absolute", bottom: 20, right: 16, left: 16, backgroundColor: "#6366f1", borderRadius: 16, padding: 16, alignItems: "center" },
  fabText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modal: { backgroundColor: "#0f172a", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { color: "#ffffff", fontSize: 20, fontWeight: "800" },
  modalClose: { color: "#64748b", fontSize: 20 },
  label: { color: "#cbd5e1", fontSize: 14, fontWeight: "600", marginBottom: 8 },
  input: { backgroundColor: "#1e293b", borderRadius: 14, padding: 14, color: "#ffffff", fontSize: 16, marginBottom: 14, borderWidth: 1, borderColor: "#334155" },
  sharerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#1e293b", borderRadius: 12, padding: 12, marginBottom: 6, borderWidth: 2, borderColor: "transparent" },
  sharerRowActive: { borderColor: "#6366f1" },
  everyoneRow: { backgroundColor: "#312e81" },
  amountRow: { flexDirection: "row", gap: 8, marginBottom: 14, alignItems: "center" },
  doneBtn: { backgroundColor: "#334155", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14 },
  doneBtnText: { color: "#ffffff", fontWeight: "700", fontSize: 15 },
  sharerName: { color: "#e2e8f0", fontSize: 15 },
  button: { backgroundColor: "#6366f1", borderRadius: 16, padding: 16, alignItems: "center", marginTop: 12 },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
});
