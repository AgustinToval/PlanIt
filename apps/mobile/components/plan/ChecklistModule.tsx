import { useCallback, useEffect, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  Alert, RefreshControl, Keyboard, Modal, ActivityIndicator,
} from "react-native";
import { api } from "../../lib/api";
import { getSocket } from "../../lib/socket";
import { useAuthStore } from "../../hooks/useAuthStore";

type Item = {
  id: string;
  title: string;
  category: string | null;
  checked: boolean;
  assignedTo: string | null;
  createdAt: string;
};

// Stable order: by creation date, so items never jump around
function sortItems(items: Item[]): Item[] {
  return [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

type Member = { rsvp: string; role: string; user: { id: string; name: string | null } };

export default function ChecklistModule({
  planId, members, myRole = "member",
}: { planId: string; members: Member[]; myRole?: string }) {
  const { user } = useAuthStore();
  const [items, setItems] = useState<Item[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [hidePacked, setHidePacked] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiItems, setAiItems] = useState<{ title: string; category: string }[]>([]);
  const [aiSelected, setAiSelected] = useState<Set<number>>(new Set());
  const [showAi, setShowAi] = useState(false);
  const [aiAdding, setAiAdding] = useState(false);

  const generateWithAi = async () => {
    setAiLoading(true);
    try {
      const res = await api.post(`/ai/packing-list/${planId}`, {}, { timeout: 40000 });
      const suggestions = res.data.items ?? [];
      if (suggestions.length === 0) {
        Alert.alert("Hmm", "The AI didn't suggest anything new.");
        return;
      }
      setAiItems(suggestions);
      setAiSelected(new Set(suggestions.map((_: unknown, i: number) => i)));
      setShowAi(true);
    } catch (e: any) {
      Alert.alert("AI error", e?.response?.data?.error ?? "Could not generate suggestions");
    } finally {
      setAiLoading(false);
    }
  };

  const addAiItems = async () => {
    setAiAdding(true);
    try {
      for (const i of aiSelected) {
        const item = aiItems[i];
        if (item) {
          await api.post(`/checklist/plan/${planId}`, { title: item.title, category: item.category });
        }
      }
      setShowAi(false);
      await load();
    } catch {
      Alert.alert("Error", "Some items could not be added");
      await load();
    } finally {
      setAiAdding(false);
    }
  };

  const canManage = myRole === "admin" || myRole === "helper";
  const nameOf = (id: string | null) => {
    if (!id) return null;
    if (id === user?.id) return "You";
    return members.find((m) => m.user.id === id)?.user.name ?? "?";
  };

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/plans/${planId}`);
      setItems(sortItems(res.data.checkItems ?? []));
    } catch { /* noop */ }
  }, [planId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const socket = getSocket();
    const refresh = () => load();
    socket.on("checklist:changed", refresh);
    return () => { socket.off("checklist:changed", refresh); };
  }, [load]);

  const addItem = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setNewTitle("");
    try {
      await api.post(`/checklist/plan/${planId}`, { title });
      await load();
    } catch {
      Alert.alert("Error", "Could not add the item");
    }
  };

  const toggleItem = async (item: Item) => {
    // optimistic update
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, checked: !i.checked } : i)));
    try {
      await api.patch(`/checklist/${item.id}`, { checked: !item.checked });
    } catch {
      await load();
    }
  };

  const claimItem = async (item: Item) => {
    const mine = item.assignedTo === user?.id;
    const newAssignee = mine ? null : user?.id ?? null;
    // optimistic update — instant feedback, no reorder
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, assignedTo: newAssignee } : i)));
    try {
      await api.patch(`/checklist/${item.id}`, { assignedTo: newAssignee });
    } catch {
      await load();
    }
  };

  const deleteItem = (item: Item) => {
    if (!canManage) return;
    Alert.alert("Delete item?", item.title, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/checklist/${item.id}`);
            await load();
          } catch { /* noop */ }
        },
      },
    ]);
  };

  const done = items.filter((i) => i.checked).length;

  return (
    <View style={{ flex: 1 }}>
      {/* Progress */}
      <View style={styles.progressCard}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <Text style={styles.progressText}>
            {items.length === 0 ? "Nothing on the list yet" : `${done} / ${items.length} packed`}
          </Text>
          <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
            <TouchableOpacity onPress={generateWithAi} disabled={aiLoading}>
              {aiLoading
                ? <ActivityIndicator size="small" color="#818cf8" />
                : <Text style={styles.aiBtn}>✨ AI</Text>}
            </TouchableOpacity>
            {items.length > 0 && (
              <TouchableOpacity onPress={() => setHidePacked((v) => !v)}>
                <Text style={styles.hideToggle}>{hidePacked ? "Show packed" : "Hide packed"}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: items.length ? `${(done / items.length) * 100}%` : "0%" },
            ]}
          />
        </View>
      </View>

      <ScrollView
        style={{ flex: 1, paddingHorizontal: 12 }}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor="#6366f1" />}
      >
        {(hidePacked ? items.filter((i) => !i.checked) : items).map((item) => {
          const assignee = nameOf(item.assignedTo);
          const mine = item.assignedTo === user?.id;
          return (
            <TouchableOpacity
              key={item.id}
              style={styles.itemRow}
              onPress={() => toggleItem(item)}
              onLongPress={() => deleteItem(item)}
            >
              <Text style={styles.checkbox}>{item.checked ? "✅" : "⬜"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemTitle, item.checked && styles.itemDone]}>
                  {item.title}
                </Text>
                {assignee && (
                  <Text style={styles.itemAssignee}>
                    {mine ? "🙋 You bring it" : `👤 ${assignee} brings it`}
                  </Text>
                )}
              </View>
              <TouchableOpacity style={[styles.claimBtn, mine && styles.claimBtnActive]} onPress={() => claimItem(item)}>
                <Text style={[styles.claimText, mine && styles.claimTextActive]}>
                  {mine ? "Yours ✓" : "I got it"}
                </Text>
              </TouchableOpacity>
            </TouchableOpacity>
          );
        })}
        {items.length === 0 && (
          <Text style={styles.empty}>Add what the group needs to bring or buy 🛒</Text>
        )}
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Add input */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Tent, ice, sunscreen..."
          placeholderTextColor="#475569"
          value={newTitle}
          onChangeText={setNewTitle}
          onSubmitEditing={addItem}
          returnKeyType="done"
        />
        <TouchableOpacity
          style={[styles.addBtn, !newTitle.trim() && { opacity: 0.5 }]}
          onPress={() => { addItem(); Keyboard.dismiss(); }}
          disabled={!newTitle.trim()}
        >
          <Text style={styles.addText}>＋</Text>
        </TouchableOpacity>
      </View>

      {/* AI suggestions modal */}
      <Modal visible={showAi} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>✨ AI suggestions</Text>
              <TouchableOpacity onPress={() => setShowAi(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSub}>Tap to deselect what you don't need</Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {aiItems.map((item, i) => {
                const selected = aiSelected.has(i);
                return (
                  <TouchableOpacity
                    key={i}
                    style={[styles.aiRow, !selected && { opacity: 0.4 }]}
                    onPress={() =>
                      setAiSelected((prev) => {
                        const next = new Set(prev);
                        next.has(i) ? next.delete(i) : next.add(i);
                        return next;
                      })
                    }
                  >
                    <Text style={styles.aiCheck}>{selected ? "✅" : "⬜"}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.aiTitle}>{item.title}</Text>
                      <Text style={styles.aiCategory}>{item.category}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              style={[styles.aiAddBtn, (aiSelected.size === 0 || aiAdding) && { opacity: 0.5 }]}
              onPress={addAiItems}
              disabled={aiSelected.size === 0 || aiAdding}
            >
              {aiAdding
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.aiAddText}>Add {aiSelected.size} items</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  progressCard: { margin: 12, backgroundColor: "#1e293b", borderRadius: 16, padding: 16 },
  progressText: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  hideToggle: { color: "#818cf8", fontSize: 13, fontWeight: "600" },
  progressBar: { height: 8, backgroundColor: "#0f172a", borderRadius: 4, overflow: "hidden" },
  progressFill: { height: 8, backgroundColor: "#22c55e", borderRadius: 4 },
  itemRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#1e293b", borderRadius: 14, padding: 12, marginBottom: 8 },
  checkbox: { fontSize: 20, marginRight: 12 },
  itemTitle: { color: "#ffffff", fontSize: 15, fontWeight: "600" },
  itemDone: { color: "#475569", textDecorationLine: "line-through" },
  itemAssignee: { color: "#818cf8", fontSize: 12, marginTop: 2 },
  claimBtn: { backgroundColor: "#0f172a", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginLeft: 8 },
  claimBtnActive: { backgroundColor: "#312e81" },
  claimText: { color: "#94a3b8", fontSize: 12, fontWeight: "700" },
  claimTextActive: { color: "#c7d2fe" },
  empty: { color: "#475569", textAlign: "center", marginTop: 40, fontSize: 14 },
  inputRow: { flexDirection: "row", padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: "#1e293b" },
  input: { flex: 1, backgroundColor: "#1e293b", borderRadius: 14, padding: 14, color: "#ffffff", fontSize: 15 },
  addBtn: { backgroundColor: "#6366f1", borderRadius: 14, width: 50, alignItems: "center", justifyContent: "center" },
  addText: { color: "#ffffff", fontSize: 22, fontWeight: "700" },
  aiBtn: { color: "#a78bfa", fontSize: 13, fontWeight: "800" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modal: { backgroundColor: "#0f172a", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  modalTitle: { color: "#ffffff", fontSize: 20, fontWeight: "800" },
  modalClose: { color: "#64748b", fontSize: 20 },
  modalSub: { color: "#64748b", fontSize: 13, marginBottom: 14 },
  aiRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#1e293b", borderRadius: 12, padding: 12, marginBottom: 6 },
  aiCheck: { fontSize: 16, marginRight: 10 },
  aiTitle: { color: "#ffffff", fontSize: 15, fontWeight: "600" },
  aiCategory: { color: "#818cf8", fontSize: 12, marginTop: 1 },
  aiAddBtn: { backgroundColor: "#7c3aed", borderRadius: 16, padding: 16, alignItems: "center", marginTop: 12 },
  aiAddText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
});
