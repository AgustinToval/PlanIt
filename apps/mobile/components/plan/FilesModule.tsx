import { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  Alert, RefreshControl, ActivityIndicator, Platform,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../lib/api";
import { getSocket } from "../../lib/socket";
import { useAuthStore } from "../../hooks/useAuthStore";
import { font, radius, shadow, Palette, themedStyles } from "../../lib/theme";
import { useTheme } from "../../hooks/useSettings";

type PlanFile = {
  id: string;
  name: string;
  mime: string;
  size: number;
  addedBy: string;
  createdAt: string;
};

function fileIcon(mime: string): keyof typeof Ionicons.glyphMap {
  if (mime.startsWith("image/")) return "image-outline";
  if (mime.includes("pdf")) return "document-text-outline";
  if (mime.includes("word") || mime.includes("document")) return "create-outline";
  if (mime.includes("sheet") || mime.includes("excel")) return "grid-outline";
  if (mime.startsWith("video/")) return "videocam-outline";
  if (mime.startsWith("audio/")) return "headset-outline";
  return "attach-outline";
}

function sizeLabel(bytes: number): string {
  if (bytes > 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes > 1_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${bytes} B`;
}

export default function FilesModule({
  planId, myRole = "member",
}: { planId: string; myRole?: string }) {
  const c = useTheme();
  const styles = getStyles(c);
  const { user } = useAuthStore();
  const [files, setFiles] = useState<PlanFile[]>([]);
  const [notes, setNotes] = useState("");
  const [savedNotes, setSavedNotes] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const [f, n] = await Promise.all([
        api.get(`/files/plan/${planId}`),
        api.get(`/files/plan/${planId}/notes`),
      ]);
      setFiles(f.data);
      setSavedNotes(n.data.notes);
      setNotes((current) => (current === "" || current === savedNotes ? n.data.notes : current));
    } catch { /* noop */ }
  }, [planId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const socket = getSocket();
    const onFiles = () => load();
    const onNotes = (data: { notes: string; by: string }) => {
      if (data.by !== user?.id) {
        setNotes(data.notes);
        setSavedNotes(data.notes);
      }
    };
    socket.on("files:changed", onFiles);
    socket.on("notes:changed", onNotes);
    return () => {
      socket.off("files:changed", onFiles);
      socket.off("notes:changed", onNotes);
    };
  }, [load, user?.id]);

  // Debounced auto-save for notes
  const onNotesChange = (text: string) => {
    setNotes(text);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await api.put(`/files/plan/${planId}/notes`, { notes: text });
        setSavedNotes(text);
      } catch { /* noop */ }
    }, 800);
  };

  const pickAndUpload = async () => {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];

    setUploading(true);
    try {
      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const dataUrl = `data:${asset.mimeType ?? "application/octet-stream"};base64,${base64}`;
      if (dataUrl.length > 7_000_000) {
        Alert.alert("Too large", "Max file size is ~5MB.");
        return;
      }
      await api.post(`/files/plan/${planId}`, {
        name: asset.name,
        mime: asset.mimeType ?? "application/octet-stream",
        data: dataUrl,
      });
      await load();
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.error ?? "Could not upload the file");
    } finally {
      setUploading(false);
    }
  };

  const openFile = async (file: PlanFile) => {
    setOpening(file.id);
    try {
      const res = await api.get(`/files/${file.id}`);
      const dataUrl: string = res.data.data;
      if (Platform.OS === "web") {
        window.open(dataUrl, "_blank");
        return;
      }
      const base64 = dataUrl.split(",")[1] ?? "";
      const safeName = file.name.replace(/[^\w.\-]/g, "_");
      const fileUri = `${FileSystem.cacheDirectory}${safeName}`;
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: file.mime });
      }
    } catch {
      Alert.alert("Error", "Could not open the file");
    } finally {
      setOpening(null);
    }
  };

  const deleteFile = (file: PlanFile) => {
    const canDelete = file.addedBy === user?.id || myRole === "admin";
    if (!canDelete) return;
    Alert.alert("Delete file?", file.name, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          try { await api.delete(`/files/${file.id}`); await load(); } catch { /* noop */ }
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={{ flex: 1, padding: 12 }}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={c.orange} />}
    >
      {/* Shared notes */}
      <View style={styles.notesHeader}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name="create-outline" size={16} color={c.ink} />
          <Text style={styles.sectionTitle}>Shared notes</Text>
        </View>
        <Text style={styles.saveState}>
          {notes === savedNotes ? "saved ✓" : "saving..."}
        </Text>
      </View>
      <TextInput
        style={styles.notesInput}
        placeholder="Meeting point, what to bring, reservation numbers..."
        placeholderTextColor={c.faint}
        value={notes}
        onChangeText={onNotesChange}
        multiline
        textAlignVertical="top"
      />

      {/* Files */}
      <View style={styles.filesHeader}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name="attach-outline" size={16} color={c.ink} />
          <Text style={styles.sectionTitle}>Files ({files.length})</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={pickAndUpload} disabled={uploading}>
          {uploading
            ? <ActivityIndicator color="#ffffff" size="small" />
            : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <Ionicons name="add" size={15} color={c.onOrange} />
                <Text style={styles.addBtnText}>Add</Text>
              </View>
            )}
        </TouchableOpacity>
      </View>

      {files.length === 0 ? (
        <Text style={styles.empty}>Attach maps, tickets, reservations, PDFs...</Text>
      ) : (
        files.map((f) => (
          <TouchableOpacity
            key={f.id}
            style={styles.fileRow}
            onPress={() => openFile(f)}
            onLongPress={() => deleteFile(f)}
          >
            <View style={styles.fileIconWrap}>
              <Ionicons name={fileIcon(f.mime)} size={18} color={c.teal} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fileName} numberOfLines={1}>{f.name}</Text>
              <Text style={styles.fileMeta}>
                {sizeLabel(f.size)} · {new Date(f.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              </Text>
            </View>
            {opening === f.id
              ? <ActivityIndicator color={c.orange} size="small" />
              : <Ionicons name="chevron-forward" size={17} color={c.faint} />}
          </TouchableOpacity>
        ))
      )}
      <Text style={styles.hint}>Tap to open/share · long-press to delete</Text>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const getStyles = themedStyles((c: Palette) => StyleSheet.create({
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  sectionTitle: { color: c.ink, fontSize: 15, fontFamily: font.semi },
  notesHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  saveState: { color: c.faint, fontSize: 11.5, fontFamily: font.bodyMedium },
  notesInput: {
    backgroundColor: c.surface, borderRadius: radius.lg, padding: 16, color: c.ink,
    fontSize: 14, fontFamily: font.bodyMedium, minHeight: 140, marginBottom: 24,
    borderWidth: 1, borderColor: c.line, lineHeight: 22,
  },
  filesHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  addBtn: {
    backgroundColor: c.orange, borderRadius: radius.md, paddingHorizontal: 14,
    paddingVertical: 8, minWidth: 64, alignItems: "center", ...shadow.orange,
  },
  addBtnText: { color: c.onOrange, fontFamily: font.semi, fontSize: 13 },
  empty: { color: c.faint, fontSize: 13.5, fontFamily: font.body, textAlign: "center", marginVertical: 20 },
  fileRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: c.surface,
    borderRadius: radius.md, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: c.line,
  },
  fileIconWrap: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: c.tealSoft,
    alignItems: "center", justifyContent: "center", marginRight: 12,
  },
  fileName: { color: c.ink, fontSize: 14, fontFamily: font.bodySemi },
  fileMeta: { color: c.muted, fontSize: 11.5, fontFamily: font.body, marginTop: 2 },
  hint: { color: c.faint, fontSize: 11.5, fontFamily: font.body, textAlign: "center", marginTop: 12 },
}));
