import { useCallback, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  Alert, RefreshControl, Modal, KeyboardAvoidingView, Platform,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
import { colors, font, radius, shadow } from "../lib/theme";

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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.orange} />}
    >
      <TouchableOpacity onPress={() => router.back()} style={styles.back}>
        <Ionicons name="chevron-back" size={18} color={colors.teal} />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Plan templates</Text>
      <Text style={styles.subtitle}>
        Saved from your plans (settings → Save as template). Use them when creating a new plan.
      </Text>

      {templates.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="documents-outline" size={40} color={colors.teal} />
          </View>
          <Text style={styles.emptyText}>No templates yet</Text>
          <Text style={styles.emptySub}>
            Open a plan → settings → "Save as template" to reuse its structure later.
          </Text>
        </View>
      ) : (
        templates.map((t) => (
          <View key={t.id} style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardName}>{t.name}</Text>
              <Text style={styles.cardMeta}>
                {t.data.type === "quick" ? "Quick" : "Full"} ·{" "}
                {t.data.modules.length} modules · {t.data.checkItems.length} items ·{" "}
                {t.data.activities.length} activities
              </Text>
              {t.data.location && (
                <View style={styles.locRow}>
                  <Ionicons name="location-outline" size={12} color={colors.muted} />
                  <Text style={styles.cardMeta}>{t.data.location}</Text>
                </View>
              )}
            </View>
            <View style={styles.actions}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => openRename(t)}>
                <Ionicons name="pencil-outline" size={17} color={colors.teal} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => deleteTemplate(t)}>
                <Ionicons name="trash-outline" size={17} color={colors.danger} />
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
                  <Ionicons name="close" size={22} color={colors.muted} />
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.input}
                value={newName}
                onChangeText={setNewName}
                placeholder="Template name"
                placeholderTextColor={colors.faint}
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
  container: { flex: 1, backgroundColor: colors.bg, padding: 20, paddingTop: 60 },
  back: { flexDirection: "row", alignItems: "center", gap: 2, marginBottom: 16 },
  backText: { color: colors.teal, fontSize: 15, fontFamily: font.bodySemi },
  title: { fontSize: 25, fontFamily: font.title, color: colors.ink, letterSpacing: -0.5, marginBottom: 6 },
  subtitle: { color: colors.muted, fontSize: 13.5, fontFamily: font.body, lineHeight: 20, marginBottom: 20 },
  empty: { alignItems: "center", marginTop: 60 },
  emptyIconWrap: {
    width: 84, height: 84, borderRadius: 26, backgroundColor: colors.tealSoft,
    alignItems: "center", justifyContent: "center",
  },
  emptyText: { color: colors.ink, fontSize: 19, fontFamily: font.title, marginTop: 16 },
  emptySub: {
    color: colors.muted, fontSize: 13.5, fontFamily: font.bodyMedium, marginTop: 8,
    textAlign: "center", paddingHorizontal: 20,
  },
  card: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.surface,
    borderRadius: radius.lg, padding: 15, marginBottom: 10,
    borderWidth: 1, borderColor: colors.line, ...shadow.card,
  },
  cardName: { color: colors.ink, fontSize: 16, fontFamily: font.semi, letterSpacing: -0.2 },
  cardMeta: { color: colors.muted, fontSize: 12.5, fontFamily: font.bodyMedium, marginTop: 3 },
  locRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  actions: { flexDirection: "row", gap: 8, marginLeft: 10 },
  actionBtn: {
    backgroundColor: colors.surface2, borderRadius: radius.sm, padding: 10,
    borderWidth: 1, borderColor: colors.line,
  },
  modalOverlay: { flex: 1, backgroundColor: "rgba(7,32,48,0.55)", justifyContent: "flex-end" },
  modal: {
    backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 40,
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { color: colors.ink, fontSize: 19, fontFamily: font.title },
  input: {
    backgroundColor: colors.surface, borderRadius: radius.md, padding: 14, color: colors.ink,
    fontSize: 15, fontFamily: font.bodyMedium, marginBottom: 14, borderWidth: 1, borderColor: colors.line,
  },
  saveBtn: {
    backgroundColor: colors.orange, borderRadius: radius.lg, padding: 16,
    alignItems: "center", ...shadow.orange,
  },
  saveText: { color: colors.onOrange, fontSize: 15, fontFamily: font.semi },
});
