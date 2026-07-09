import { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  Alert, RefreshControl, ActivityIndicator, Platform,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { api } from "../../lib/api";
import { getSocket } from "../../lib/socket";
import { useAuthStore } from "../../hooks/useAuthStore";

type PlanFile = {
  id: string;
  name: string;
  mime: string;
  size: number;
  addedBy: string;
  createdAt: string;
};

function fileEmoji(mime: string): string {
  if (mime.startsWith("image/")) return "🖼️";
  if (mime.includes("pdf")) return "📄";
  if (mime.includes("word") || mime.includes("document")) return "📝";
  if (mime.includes("sheet") || mime.includes("excel")) return "📊";
  if (mime.startsWith("video/")) return "🎬";
  if (mime.startsWith("audio/")) return "🎧";
  return "📎";
}

function sizeLabel(bytes: number): string {
  if (bytes > 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes > 1_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${bytes} B`;
}

export default function FilesModule({
  planId, myRole = "member",
}: { planId: string; myRole?: string }) {
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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor="#6366f1" />}
    >
      {/* Shared notes */}
      <View style={styles.notesHeader}>
        <Text style={styles.sectionTitle}>📝 Shared notes</Text>
        <Text style={styles.saveState}>
          {notes === savedNotes ? "saved ✓" : "saving..."}
        </Text>
      </View>
      <TextInput
        style={styles.notesInput}
        placeholder="Meeting point, what to bring, reservation numbers..."
        placeholderTextColor="#475569"
        value={notes}
        onChangeText={onNotesChange}
        multiline
        textAlignVertical="top"
      />

      {/* Files */}
      <View style={styles.filesHeader}>
        <Text style={styles.sectionTitle}>📎 Files ({files.length})</Text>
        <TouchableOpacity style={styles.addBtn} onPress={pickAndUpload} disabled={uploading}>
          {uploading
            ? <ActivityIndicator color="#ffffff" size="small" />
            : <Text style={styles.addBtnText}>＋ Add</Text>}
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
            <Text style={styles.fileEmoji}>{fileEmoji(f.mime)}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.fileName} numberOfLines={1}>{f.name}</Text>
              <Text style={styles.fileMeta}>
                {sizeLabel(f.size)} · {new Date(f.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              </Text>
            </View>
            {opening === f.id
              ? <ActivityIndicator color="#6366f1" size="small" />
              : <Text style={styles.fileChevron}>›</Text>}
          </TouchableOpacity>
        ))
      )}
      <Text style={styles.hint}>Tap to open/share · long-press to delete</Text>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  notesHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  saveState: { color: "#475569", fontSize: 12 },
  notesInput: {
    backgroundColor: "#1e293b", borderRadius: 16, padding: 16, color: "#ffffff",
    fontSize: 15, minHeight: 140, marginBottom: 24, borderWidth: 1, borderColor: "#334155",
    lineHeight: 22,
  },
  filesHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  addBtn: { backgroundColor: "#6366f1", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8, minWidth: 64, alignItems: "center" },
  addBtnText: { color: "#ffffff", fontWeight: "700", fontSize: 14 },
  empty: { color: "#475569", fontSize: 14, textAlign: "center", marginVertical: 20 },
  fileRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#1e293b", borderRadius: 14, padding: 14, marginBottom: 8 },
  fileEmoji: { fontSize: 24, marginRight: 12 },
  fileName: { color: "#ffffff", fontSize: 15, fontWeight: "600" },
  fileMeta: { color: "#64748b", fontSize: 12, marginTop: 2 },
  fileChevron: { color: "#475569", fontSize: 20 },
  hint: { color: "#475569", fontSize: 12, textAlign: "center", marginTop: 12 },
});
