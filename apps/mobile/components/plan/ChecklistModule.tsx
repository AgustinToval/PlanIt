import { useCallback, useEffect, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  Alert, RefreshControl, Keyboard, Modal, ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../lib/api";
import { getSocket } from "../../lib/socket";
import { useAuthStore } from "../../hooks/useAuthStore";
import { colors, font, radius, shadow } from "../../lib/theme";

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
            <TouchableOpacity onPress={generateWithAi} disabled={aiLoading} style={styles.aiBtnRow}>
              {aiLoading
                ? <ActivityIndicator size="small" color={colors.orange} />
                : (
                  <>
                    <Ionicons name="sparkles" size={13} color={colors.orange} />
                    <Text style={styles.aiBtn}>AI</Text>
                  </>
                )}
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.orange} />}
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
              <Ionicons
                name={item.checked ? "checkbox" : "square-outline"}
                size={21}
                color={item.checked ? colors.teal : colors.faint}
                style={{ marginRight: 11 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemTitle, item.checked && styles.itemDone]}>
                  {item.title}
                </Text>
                {assignee && (
                  <Text style={styles.itemAssignee}>
                    {mine ? "You bring it" : `${assignee} brings it`}
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
          <Text style={styles.empty}>Add what the group needs to bring or buy</Text>
        )}
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Add input */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Tent, ice, sunscreen..."
          placeholderTextColor={colors.faint}
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
          <Ionicons name="add" size={22} color={colors.onOrange} />
        </TouchableOpacity>
      </View>

      {/* AI suggestions modal */}
      <Modal visible={showAi} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                <Ionicons name="sparkles" size={17} color={colors.orange} />
                <Text style={styles.modalTitle}>AI suggestions</Text>
              </View>
              <TouchableOpacity onPress={() => setShowAi(false)}>
                <Ionicons name="close" size={22} color={colors.muted} />
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
                    <Ionicons
                      name={selected ? "checkbox" : "square-outline"}
                      size={19}
                      color={selected ? colors.teal : colors.faint}
                      style={{ marginRight: 10 }}
                    />
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
  progressCard: {
    margin: 12, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16,
    borderWidth: 1, borderColor: colors.line, ...shadow.card,
  },
  progressText: { color: colors.ink, fontSize: 14, fontFamily: font.semi },
  hideToggle: { color: colors.teal, fontSize: 12.5, fontFamily: font.bodySemi },
  progressBar: { height: 8, backgroundColor: colors.line, borderRadius: 4, overflow: "hidden" },
  progressFill: { height: 8, backgroundColor: colors.teal, borderRadius: 4 },
  itemRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.surface,
    borderRadius: radius.md, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.line,
  },
  itemTitle: { color: colors.ink, fontSize: 14.5, fontFamily: font.bodySemi },
  itemDone: { color: colors.faint, textDecorationLine: "line-through" },
  itemAssignee: { color: colors.teal, fontSize: 12, fontFamily: font.bodyMedium, marginTop: 2 },
  claimBtn: {
    backgroundColor: colors.surface2, borderRadius: radius.sm, paddingHorizontal: 12,
    paddingVertical: 8, marginLeft: 8, borderWidth: 1, borderColor: colors.line,
  },
  claimBtnActive: { backgroundColor: colors.orangeSoft, borderColor: colors.orange },
  claimText: { color: colors.muted, fontSize: 12, fontFamily: font.semi },
  claimTextActive: { color: colors.orange },
  empty: { color: colors.faint, textAlign: "center", marginTop: 40, fontSize: 13.5, fontFamily: font.body },
  inputRow: {
    flexDirection: "row", padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: colors.line,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1, backgroundColor: colors.surface2, borderRadius: radius.md, padding: 13,
    color: colors.ink, fontSize: 14, fontFamily: font.bodyMedium,
    borderWidth: 1, borderColor: colors.line,
  },
  addBtn: {
    backgroundColor: colors.orange, borderRadius: radius.md, width: 48,
    alignItems: "center", justifyContent: "center", ...shadow.orange,
  },
  aiBtnRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  aiBtn: { color: colors.orange, fontSize: 12.5, fontFamily: font.semi },
  modalOverlay: { flex: 1, backgroundColor: "rgba(7,32,48,0.55)", justifyContent: "flex-end" },
  modal: {
    backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 40,
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  modalTitle: { color: colors.ink, fontSize: 19, fontFamily: font.title },
  modalSub: { color: colors.muted, fontSize: 12.5, fontFamily: font.body, marginBottom: 14 },
  aiRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.surface,
    borderRadius: radius.md, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: colors.line,
  },
  aiTitle: { color: colors.ink, fontSize: 14, fontFamily: font.bodySemi },
  aiCategory: { color: colors.teal, fontSize: 11.5, fontFamily: font.bodyMedium, marginTop: 1 },
  aiAddBtn: {
    backgroundColor: colors.orange, borderRadius: radius.lg, padding: 16,
    alignItems: "center", marginTop: 12, ...shadow.orange,
  },
  aiAddText: { color: colors.onOrange, fontSize: 15, fontFamily: font.semi },
});
