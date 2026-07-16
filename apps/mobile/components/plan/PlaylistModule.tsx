import { useCallback, useEffect, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  Alert, RefreshControl, Modal, Linking, KeyboardAvoidingView, Platform,
  Keyboard, TouchableWithoutFeedback,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../lib/api";
import { getSocket } from "../../lib/socket";
import { useAuthStore } from "../../hooks/useAuthStore";
import { font, radius, shadow, Palette, themedStyles } from "../../lib/theme";
import { useTheme, useT } from "../../hooks/useSettings";

type Song = {
  id: string;
  title: string;
  artist: string | null;
  source: string; // spotify | youtube
  url: string;
  addedBy: string;
  score: number;
  myVote: number;
  voteCount: number;
};

export default function PlaylistModule({
  planId, myRole = "member",
}: { planId: string; myRole?: string }) {
  const c = useTheme();
  const styles = getStyles(c);
  const t = useT();
  const { user } = useAuthStore();
  const [songs, setSongs] = useState<Song[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/playlist/plan/${planId}`);
      setSongs(res.data);
    } catch { /* noop */ }
  }, [planId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const socket = getSocket();
    const refresh = () => load();
    socket.on("playlist:changed", refresh);
    return () => { socket.off("playlist:changed", refresh); };
  }, [load]);

  const addSong = async () => {
    if (!url.trim()) return;
    setBusy(true);
    try {
      await api.post(`/playlist/plan/${planId}`, {
        url: url.trim(),
        title: title.trim() || undefined,
        artist: artist.trim() || undefined,
      });
      setUrl(""); setTitle(""); setArtist("");
      setShowAdd(false);
      await load();
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.error ?? "Could not add the song");
    } finally {
      setBusy(false);
    }
  };

  const vote = async (song: Song, value: number) => {
    const newValue = song.myVote === value ? 0 : value; // tap again to clear
    // optimistic
    setSongs((prev) =>
      prev.map((s) =>
        s.id === song.id ? { ...s, score: s.score - s.myVote + newValue, myVote: newValue } : s
      ).sort((a, b) => b.score - a.score)
    );
    try {
      await api.post(`/playlist/${song.id}/vote`, { value: newValue });
    } catch {
      await load();
    }
  };

  const openSong = (song: Song) => {
    Linking.openURL(song.url).catch(() => Alert.alert("Error", "Could not open the link"));
  };

  const deleteSong = (song: Song) => {
    const canDelete = song.addedBy === user?.id || myRole === "admin";
    if (!canDelete) return;
    Alert.alert(t("py.removeQ"), song.title, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.remove"), style: "destructive",
        onPress: async () => {
          try { await api.delete(`/playlist/${song.id}`); await load(); } catch { /* noop */ }
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1, padding: 12 }}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={c.orange} />}
      >
        {songs.length === 0 && (
          <View style={styles.empty}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="musical-notes-outline" size={38} color={c.teal} />
            </View>
            <Text style={styles.emptyText}>{t("py.empty")}</Text>
            <Text style={styles.emptySub}>{t("py.sub")}</Text>
          </View>
        )}
        {songs.map((song, i) => (
          <View key={song.id} style={styles.songRow}>
            <Text style={styles.rank}>{i + 1}</Text>
            <TouchableOpacity
              style={{ flex: 1 }}
              onPress={() => openSong(song)}
              onLongPress={() => deleteSong(song)}
            >
              <View style={styles.songTitleRow}>
                <View style={[styles.sourceDot, { backgroundColor: song.source === "spotify" ? "#1DB954" : "#E05252" }]} />
                <Text style={styles.songTitle} numberOfLines={1}>{song.title}</Text>
              </View>
              {song.artist ? <Text style={styles.songArtist}>{song.artist}</Text> : null}
              <Text style={styles.songSource}>
                {song.source === "spotify" ? "Spotify" : "YouTube Music"} · {t("py.open")}
              </Text>
            </TouchableOpacity>

            <View style={styles.voteBox}>
              <TouchableOpacity onPress={() => vote(song, 1)} style={{ padding: 2 }}>
                <Ionicons name="chevron-up" size={18} color={song.myVote === 1 ? c.teal : c.faint} />
              </TouchableOpacity>
              <Text style={styles.score}>{song.score}</Text>
              <TouchableOpacity onPress={() => vote(song, -1)} style={{ padding: 2 }}>
                <Ionicons name="chevron-down" size={18} color={song.myVote === -1 ? c.danger : c.faint} />
              </TouchableOpacity>
            </View>
          </View>
        ))}
        <View style={{ height: 90 }} />
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => setShowAdd(true)}>
        <View style={styles.fabRow}>
          <Ionicons name="add" size={18} color={c.onOrange} />
          <Text style={styles.fabText}>{t("py.add")}</Text>
        </View>
      </TouchableOpacity>

      {/* Add song modal */}
      <Modal visible={showAdd} animationType="slide" transparent>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t("py.new")}</Text>
              <TouchableOpacity onPress={() => setShowAdd(false)}>
                <Ionicons name="close" size={22} color={c.muted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>{t("py.link")}</Text>
            <TextInput
              style={styles.input}
              placeholder="https://open.spotify.com/track/..."
              placeholderTextColor={c.faint}
              value={url}
              onChangeText={setUrl}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.label}>{t("py.song")}</Text>
            <TextInput
              style={styles.input}
              placeholder="Blinding Lights"
              placeholderTextColor={c.faint}
              value={title}
              onChangeText={setTitle}
            />

            <Text style={styles.label}>{t("py.artist")}</Text>
            <TextInput
              style={styles.input}
              placeholder="The Weeknd"
              placeholderTextColor={c.faint}
              value={artist}
              onChangeText={setArtist}
            />

            <Text style={styles.hint}>
              {t("py.hint")}
            </Text>

            <TouchableOpacity
              style={[styles.button, (busy || !url.trim()) && { opacity: 0.5 }]}
              onPress={addSong}
              disabled={busy || !url.trim()}
            >
              <Text style={styles.buttonText}>{busy ? "..." : t("py.addTo")}</Text>
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
  empty: { alignItems: "center", marginTop: 70 },
  emptyIconWrap: {
    width: 84, height: 84, borderRadius: 26, backgroundColor: c.tealSoft,
    alignItems: "center", justifyContent: "center",
  },
  emptyText: { color: c.ink, fontSize: 19, fontFamily: font.title, marginTop: 16 },
  emptySub: {
    color: c.muted, fontSize: 13.5, fontFamily: font.bodyMedium, marginTop: 8,
    textAlign: "center", paddingHorizontal: 30,
  },
  songRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: c.surface,
    borderRadius: radius.md, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: c.line,
  },
  rank: { color: c.faint, fontSize: 13, fontFamily: font.bodyBold, width: 22 },
  songTitleRow: { flexDirection: "row", alignItems: "center" },
  sourceDot: { width: 8, height: 8, borderRadius: 4, marginRight: 7 },
  songTitle: { color: c.ink, fontSize: 14.5, fontFamily: font.bodySemi, flex: 1 },
  songArtist: { color: c.muted, fontSize: 12.5, fontFamily: font.bodyMedium, marginTop: 1 },
  songSource: { color: c.faint, fontSize: 11, fontFamily: font.body, marginTop: 2 },
  voteBox: { alignItems: "center", marginLeft: 8, width: 40 },
  score: { color: c.ink, fontSize: 13.5, fontFamily: font.bodyBold, paddingVertical: 2 },
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
    fontSize: 14.5, fontFamily: font.bodyMedium, marginBottom: 12, borderWidth: 1, borderColor: c.line,
  },
  hint: { color: c.muted, fontSize: 12, fontFamily: font.body, marginBottom: 14, lineHeight: 17 },
  button: {
    backgroundColor: c.orange, borderRadius: radius.lg, padding: 16,
    alignItems: "center", ...shadow.orange,
  },
  buttonText: { color: c.onOrange, fontSize: 15, fontFamily: font.semi },
}));
