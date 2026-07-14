import { useCallback, useEffect, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Image,
  Alert, RefreshControl, Modal, Dimensions, ActivityIndicator,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../lib/api";
import { getSocket } from "../../lib/socket";
import { useAuthStore } from "../../hooks/useAuthStore";
import { colors, font, radius, shadow } from "../../lib/theme";

type Photo = {
  id: string;
  url: string;
  caption: string | null;
  createdAt: string;
  user: { id: string; name: string | null };
};

const { width } = Dimensions.get("window");
const GAP = 4;
const COLS = 3;
const TILE = (width - GAP * (COLS + 1)) / COLS;

export default function GalleryModule({
  planId, myRole = "member",
}: { planId: string; myRole?: string }) {
  const { user } = useAuthStore();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [viewer, setViewer] = useState<Photo | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/gallery/plan/${planId}`);
      setPhotos(res.data);
    } catch { /* noop */ }
  }, [planId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const socket = getSocket();
    const refresh = () => load();
    socket.on("gallery:changed", refresh);
    return () => { socket.off("gallery:changed", refresh); };
  }, [load]);

  const pickAndUpload = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo access to add pictures.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.5,
      base64: true,
      allowsMultipleSelection: false,
    });
    if (result.canceled || !result.assets?.[0]?.base64) return;

    const asset = result.assets[0];
    const mime = asset.mimeType ?? "image/jpeg";
    const dataUrl = `data:${mime};base64,${asset.base64}`;
    if (dataUrl.length > 7_000_000) {
      Alert.alert("Too large", "That photo is too big — try a smaller one.");
      return;
    }

    setUploading(true);
    try {
      await api.post(`/gallery/plan/${planId}`, { url: dataUrl });
      await load();
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.error ?? "Could not upload the photo");
    } finally {
      setUploading(false);
    }
  };

  const [saving, setSaving] = useState(false);
  const savePhoto = async (photo: Photo) => {
    if (Platform.OS === "web") {
      // On web, open the image in a new tab to save it
      window.open(photo.url, "_blank");
      return;
    }
    const perm = await MediaLibrary.requestPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo access to save pictures.");
      return;
    }
    setSaving(true);
    try {
      // data URL → write to a temp file → save to camera roll
      const match = photo.url.match(/^data:(image\/\w+);base64,(.+)$/);
      const ext = match?.[1]?.split("/")[1] ?? "jpg";
      const base64 = match?.[2] ?? "";
      const fileUri = `${FileSystem.cacheDirectory}planit_${photo.id}.${ext}`;
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
      await MediaLibrary.saveToLibraryAsync(fileUri);
      Alert.alert("Saved", "The photo is now in your gallery.");
    } catch {
      Alert.alert("Error", "Could not save the photo.");
    } finally {
      setSaving(false);
    }
  };

  const deletePhoto = (photo: Photo) => {
    const canDelete = photo.user.id === user?.id || myRole === "admin";
    if (!canDelete) return;
    Alert.alert("Delete photo?", "", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/gallery/${photo.id}`);
            setViewer(null);
            await load();
          } catch { /* noop */ }
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.grid}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.orange} />}
      >
        {photos.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="images-outline" size={38} color={colors.teal} />
            </View>
            <Text style={styles.emptyText}>No photos yet</Text>
            <Text style={styles.emptySub}>Share the memories from this plan</Text>
          </View>
        ) : (
          photos.map((p) => (
            <TouchableOpacity key={p.id} onPress={() => setViewer(p)} style={styles.tileWrap}>
              <Image source={{ uri: p.url }} style={styles.tile} />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={pickAndUpload} disabled={uploading}>
        {uploading
          ? <ActivityIndicator color="#ffffff" />
          : (
            <View style={styles.fabRow}>
              <Ionicons name="add" size={18} color={colors.onOrange} />
              <Text style={styles.fabText}>Add photo</Text>
            </View>
          )}
      </TouchableOpacity>

      {/* Full-screen viewer */}
      <Modal visible={viewer !== null} transparent animationType="fade">
        <View style={styles.viewerOverlay}>
          <TouchableOpacity style={styles.viewerClose} onPress={() => setViewer(null)}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {viewer && (
            <>
              <Image source={{ uri: viewer.url }} style={styles.viewerImage} resizeMode="contain" />
              <View style={styles.viewerInfo}>
                <Text style={styles.viewerUser}>
                  {viewer.user.id === user?.id ? "You" : viewer.user.name ?? "?"}
                </Text>
                <Text style={styles.viewerDate}>
                  {new Date(viewer.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </Text>
              </View>
              <View style={styles.viewerActions}>
                <TouchableOpacity
                  style={styles.viewerSave}
                  onPress={() => savePhoto(viewer)}
                  disabled={saving}
                >
                  {saving
                    ? <ActivityIndicator color="#fff" />
                    : (
                      <View style={styles.fabRow}>
                        <Ionicons name="download-outline" size={16} color="#fff" />
                        <Text style={styles.viewerSaveText}>Save</Text>
                      </View>
                    )}
                </TouchableOpacity>
                {(viewer.user.id === user?.id || myRole === "admin") && (
                  <TouchableOpacity style={styles.viewerDelete} onPress={() => deletePhoto(viewer)}>
                    <View style={styles.fabRow}>
                      <Ionicons name="trash-outline" size={16} color="#FCA5A5" />
                      <Text style={styles.viewerDeleteText}>Delete</Text>
                    </View>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", padding: GAP, paddingBottom: 90 },
  tileWrap: { margin: GAP / 2 },
  tile: { width: TILE, height: TILE, borderRadius: 8, backgroundColor: colors.line },
  empty: { width: "100%", alignItems: "center", marginTop: 80 },
  emptyIconWrap: {
    width: 84, height: 84, borderRadius: 26, backgroundColor: colors.tealSoft,
    alignItems: "center", justifyContent: "center",
  },
  emptyText: { color: colors.ink, fontSize: 19, fontFamily: font.title, marginTop: 16 },
  emptySub: { color: colors.muted, fontSize: 13.5, fontFamily: font.bodyMedium, marginTop: 8 },
  fab: {
    position: "absolute", bottom: 20, right: 16, left: 16, backgroundColor: colors.orange,
    borderRadius: radius.lg, padding: 16, alignItems: "center", ...shadow.orange,
  },
  fabRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  fabText: { color: colors.onOrange, fontSize: 15, fontFamily: font.semi },
  viewerOverlay: { flex: 1, backgroundColor: "rgba(4,22,33,0.96)", justifyContent: "center", alignItems: "center" },
  viewerClose: { position: "absolute", top: 60, right: 24, zIndex: 2 },
  viewerImage: { width: "100%", height: "70%" },
  viewerInfo: { position: "absolute", bottom: 110, left: 24 },
  viewerUser: { color: "#fff", fontSize: 15, fontFamily: font.semi },
  viewerDate: { color: "#8FB0C0", fontSize: 12.5, fontFamily: font.bodyMedium, marginTop: 2 },
  viewerActions: { position: "absolute", bottom: 48, alignSelf: "center", flexDirection: "row", gap: 12 },
  viewerSave: {
    backgroundColor: colors.teal, borderRadius: radius.md,
    paddingHorizontal: 24, paddingVertical: 12,
  },
  viewerSaveText: { color: "#fff", fontSize: 14, fontFamily: font.semi },
  viewerDelete: {
    backgroundColor: "rgba(224,82,82,0.25)", borderRadius: radius.md,
    paddingHorizontal: 20, paddingVertical: 12,
  },
  viewerDeleteText: { color: "#FCA5A5", fontSize: 14, fontFamily: font.semi },
});
