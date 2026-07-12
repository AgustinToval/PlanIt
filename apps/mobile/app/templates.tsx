import { useCallback, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  Alert, RefreshControl, Modal, KeyboardAvoidingView, Platform,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { api } from "../lib/api";

type Template = {
  id: string;
  name: string;
  createdAt: string;
  data: {
    title: string;
    location: string | null;
    type: string;
    modules: string[];
    checkItems: { title: string }[];
    activities: { title: string }[];
  };
};

export default function TemplatesScreen() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [renaming, setRenaming] = useState<Template | null>(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const res = await api.get("/plans/templates/mine");
      setTemplates(res.data);
    } catch { /* noop */ }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const openRename = (t: Template) => {
    setRenaming(t);
    setNewName(t.name);
  };

  const saveRename = async () => {
    if (!renaming || !newName.trim()) return;
    setBusy(true);
    try {
      await api.patch(`/plans/templates/${renaming.id}`, { name: newName.trim() });
      setRenaming(null);
      await load();
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.error ?? "Could not rename");
    } finally {
      setBusy(false);
    }
  };

  const deleteTemplate = (t: Template) => {
    Alert.alert("Delete template?", `"${t.name}" will be removed. Plans created from it are not affected.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/plans/templates/${t.id}`);
            await load();
          } catch { /* noop */ }
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor="#6366f1" />}
    >
      <TouchableOpacity onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>‹ Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>📑 Plan templates</Text>
      <Text style={styles.subtitle}>
        Saved from your plans (⚙️ → Save as template). Use them when creating a new plan.
      </Text>

      {templates.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📑</Text>
          <Text style={styles.emptyText}>No templates yet</Text>
          <Text style={styles.emptySub}>
            Open a plan → ⚙️ → "Save as template" to reuse its structure later.
          </Text>
        </View>
      ) : (
        templates.map((t) => (
          <View key={t.id} style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardName}>{t.name}</Text>
              <Text style={styles.cardMeta}>
                {t.data.type === "quick" ? "⚡ Quick" : "🗓️ Full"} ·{" "}
                {t.data.modules.length} modules · {t.data.checkItems.length} items ·{" "}
                {t.data.activities.length} activities
              </Text>
              {t.data.location && <Text style={styles.cardMeta}>📍 {t.data.location}</Text>}
            </View>
            <View style={styles.actions}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => openRename(t)}>
                <Text style={styles.actionText}>✏️</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => deleteTemplate(t)}>
                <Text style={styles.actionText}>🗑️</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
      <View style={{ height: 40 }} />

      {/* Rename modal */}
      <Modal visible={renaming !== null} animationType="slide" transparent>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.modalOverlay}>
            <View style={styles.modal}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Rename template</Text>
                <TouchableOpacity onPress={() => setRenaming(null)}>
                  <Text style={styles.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.input}
                value={newName}
                onChangeText={setNewName}
                placeholder="Template name"
                placeholderTextColor="#475569"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={saveRename}
              />
              <TouchableOpacity
                style={[styles.saveBtn, (!newName.trim() || busy) && { opacity: 0.5 }]}
                onPress={saveRename}
                disabled={!newName.trim() || busy}
              >
                <Text style={styles.saveText}>{busy ? "..." : "Save"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a", padding: 24, paddingTop: 60 },
  back: { marginBottom: 16 },
  backText: { color: "#6366f1", fontSize: 17 },
  title: { fontSize: 28, fontWeight: "800", color: "#ffffff", marginBottom: 6 },
  subtitle: { color: "#64748b", fontSize: 14, lineHeight: 20, marginBottom: 20 },
  empty: { alignItems: "center", marginTop: 60 },
  emptyIcon: { fontSize: 56 },
  emptyText: { color: "#ffffff", fontSize: 20, fontWeight: "700", marginTop: 16 },
  emptySub: { color: "#64748b", fontSize: 14, marginTop: 8, textAlign: "center", paddingHorizontal: 20 },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: "#1e293b", borderRadius: 16, padding: 16, marginBottom: 10 },
  cardName: { color: "#ffffff", fontSize: 17, fontWeight: "700" },
  cardMeta: { color: "#64748b", fontSize: 13, marginTop: 3 },
  actions: { flexDirection: "row", gap: 8, marginLeft: 10 },
  actionBtn: { backgroundColor: "#0f172a", borderRadius: 12, padding: 10 },
  actionText: { fontSize: 18 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modal: { backgroundColor: "#0f172a", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { color: "#ffffff", fontSize: 20, fontWeight: "800" },
  modalClose: { color: "#64748b", fontSize: 20 },
  input: { backgroundColor: "#1e293b", borderRadius: 14, padding: 14, color: "#ffffff", fontSize: 16, marginBottom: 14, borderWidth: 1, borderColor: "#334155" },
  saveBtn: { backgroundColor: "#6366f1", borderRadius: 16, padding: 16, alignItems: "center" },
  saveText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
});
