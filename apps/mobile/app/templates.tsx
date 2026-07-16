import { useCallback, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  Alert, RefreshControl, Modal, KeyboardAvoidingView, Platform,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
import { font, radius, shadow, Palette, themedStyles } from "../lib/theme";
import { useTheme, useT } from "../hooks/useSettings";

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
  const c = useTheme();
  const styles = getStyles(c);
  const t = useT();
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

  const openRename = (tpl: Template) => {
    setRenaming(tpl);
    setNewName(tpl.name);
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

  const deleteTemplate = (tpl: Template) => {
    Alert.alert(t("tp.deleteQ"), `"${tpl.name}" ${t("tp.deleteMsg")}`, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"), style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/plans/templates/${tpl.id}`);
            await load();
          } catch { /* noop */ }
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={c.orange} />}
    >
      <TouchableOpacity onPress={() => router.back()} style={styles.back}>
        <Ionicons name="chevron-back" size={18} color={c.teal} />
        <Text style={styles.backText}>{t("common.back")}</Text>
      </TouchableOpacity>

      <Text style={styles.title}>{t("scr.templates")}</Text>
      <Text style={styles.subtitle}>
        {t("tp.sub")}
      </Text>

      {templates.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="documents-outline" size={40} color={c.teal} />
          </View>
          <Text style={styles.emptyText}>{t("tp.empty")}</Text>
          <Text style={styles.emptySub}>
            {t("tp.emptySub")}
          </Text>
        </View>
      ) : (
        templates.map((tpl) => (
          <View key={tpl.id} style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardName}>{tpl.name}</Text>
              <Text style={styles.cardMeta}>
                {tpl.data.type === "quick" ? t("tp.quick") : t("tp.full")} ·{" "}
                {tpl.data.modules.length} {t("tp.modules")} · {tpl.data.checkItems.length} {t("tp.items")} ·{" "}
                {tpl.data.activities.length} {t("tp.activities")}
              </Text>
              {tpl.data.location && (
                <View style={styles.locRow}>
                  <Ionicons name="location-outline" size={12} color={c.muted} />
                  <Text style={styles.cardMeta}>{tpl.data.location}</Text>
                </View>
              )}
            </View>
            <View style={styles.actions}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => openRename(tpl)}>
                <Ionicons name="pencil-outline" size={17} color={c.teal} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => deleteTemplate(tpl)}>
                <Ionicons name="trash-outline" size={17} color={c.danger} />
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
                <Text style={styles.modalTitle}>{t("tp.rename")}</Text>
                <TouchableOpacity onPress={() => setRenaming(null)}>
                  <Ionicons name="close" size={22} color={c.muted} />
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.input}
                value={newName}
                onChangeText={setNewName}
                placeholder={t("tp.namePh")}
                placeholderTextColor={c.faint}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={saveRename}
              />
              <TouchableOpacity
                style={[styles.saveBtn, (!newName.trim() || busy) && { opacity: 0.5 }]}
                onPress={saveRename}
                disabled={!newName.trim() || busy}
              >
                <Text style={styles.saveText}>{busy ? "..." : t("common.save")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

const getStyles = themedStyles((c: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg, padding: 20, paddingTop: 60 },
  back: { flexDirection: "row", alignItems: "center", gap: 2, marginBottom: 16 },
  backText: { color: c.teal, fontSize: 15, fontFamily: font.bodySemi },
  title: { fontSize: 25, fontFamily: font.title, color: c.ink, letterSpacing: -0.5, marginBottom: 6 },
  subtitle: { color: c.muted, fontSize: 13.5, fontFamily: font.body, lineHeight: 20, marginBottom: 20 },
  empty: { alignItems: "center", marginTop: 60 },
  emptyIconWrap: {
    width: 84, height: 84, borderRadius: 26, backgroundColor: c.tealSoft,
    alignItems: "center", justifyContent: "center",
  },
  emptyText: { color: c.ink, fontSize: 19, fontFamily: font.title, marginTop: 16 },
  emptySub: {
    color: c.muted, fontSize: 13.5, fontFamily: font.bodyMedium, marginTop: 8,
    textAlign: "center", paddingHorizontal: 20,
  },
  card: {
    flexDirection: "row", alignItems: "center", backgroundColor: c.surface,
    borderRadius: radius.lg, padding: 15, marginBottom: 10,
    borderWidth: 1, borderColor: c.line, ...shadow.card,
  },
  cardName: { color: c.ink, fontSize: 16, fontFamily: font.semi, letterSpacing: -0.2 },
  cardMeta: { color: c.muted, fontSize: 12.5, fontFamily: font.bodyMedium, marginTop: 3 },
  locRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  actions: { flexDirection: "row", gap: 8, marginLeft: 10 },
  actionBtn: {
    backgroundColor: c.surface2, borderRadius: radius.sm, padding: 10,
    borderWidth: 1, borderColor: c.line,
  },
  modalOverlay: { flex: 1, backgroundColor: "rgba(7,32,48,0.55)", justifyContent: "flex-end" },
  modal: {
    backgroundColor: c.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 40,
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { color: c.ink, fontSize: 19, fontFamily: font.title },
  input: {
    backgroundColor: c.surface, borderRadius: radius.md, padding: 14, color: c.ink,
    fontSize: 15, fontFamily: font.bodyMedium, marginBottom: 14, borderWidth: 1, borderColor: c.line,
  },
  saveBtn: {
    backgroundColor: c.orange, borderRadius: radius.lg, padding: 16,
    alignItems: "center", ...shadow.orange,
  },
  saveText: { color: c.onOrange, fontSize: 15, fontFamily: font.semi },
}));
