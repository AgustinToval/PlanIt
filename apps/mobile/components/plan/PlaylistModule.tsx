import { useCallback, useEffect, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  Alert, RefreshControl, Modal, Linking,
} from "react-native";
import { api } from "../../lib/api";
import { getSocket } from "../../lib/socket";
import { useAuthStore } from "../../hooks/useAuthStore";

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
    Alert.alert("Remove song?", song.title, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive",
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor="#6366f1" />}
      >
        {songs.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🎵</Text>
            <Text style={styles.emptyText}>No songs yet</Text>
            <Text style={styles.emptySub}>Paste a Spotify or YouTube Music link to start the vibe</Text>
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
                <Text style={styles.sourceIcon}>{song.source === "spotify" ? "🟢" : "🔴"}</Text>
                <Text style={styles.songTitle} numberOfLines={1}>{song.title}</Text>
              </View>
              {song.artist ? <Text style={styles.songArtist}>{song.artist}</Text> : null}
              <Text style={styles.songSource}>
                {song.source === "spotify" ? "Spotify" : "YouTube Music"} · tap to open
              </Text>
            </TouchableOpacity>

            <View style={styles.voteBox}>
              <TouchableOpacity onPress={() => vote(song, 1)}>
                <Text style={[styles.arrow, song.myVote === 1 && styles.arrowUp]}>▲</Text>
              </TouchableOpacity>
              <Text style={styles.score}>{song.score}</Text>
              <TouchableOpacity onPress={() => vote(song, -1)}>
                <Text style={[styles.arrow, song.myVote === -1 && styles.arrowDown]}>▼</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
        <View style={{ height: 90 }} />
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => setShowAdd(true)}>
        <Text style={styles.fabText}>＋ Add song</Text>
      </TouchableOpacity>

      {/* Add song modal */}
      <Modal visible={showAdd} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add a song</Text>
              <TouchableOpacity onPress={() => setShowAdd(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Spotify or YouTube Music link</Text>
            <TextInput
              style={styles.input}
              placeholder="https://open.spotify.com/track/..."
              placeholderTextColor="#475569"
              value={url}
              onChangeText={setUrl}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.label}>Song name (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Blinding Lights"
              placeholderTextColor="#475569"
              value={title}
              onChangeText={setTitle}
            />

            <Text style={styles.label}>Artist (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="The Weeknd"
              placeholderTextColor="#475569"
              value={artist}
              onChangeText={setArtist}
            />

            <Text style={styles.hint}>
              💡 In Spotify or YouTube Music: tap Share → Copy link, then paste it here.
            </Text>

            <TouchableOpacity
              style={[styles.button, (busy || !url.trim()) && { opacity: 0.5 }]}
              onPress={addSong}
              disabled={busy || !url.trim()}
            >
              <Text style={styles.buttonText}>{busy ? "..." : "Add to playlist"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: "center", marginTop: 70 },
  emptyIcon: { fontSize: 56 },
  emptyText: { color: "#ffffff", fontSize: 20, fontWeight: "700", marginTop: 16 },
  emptySub: { color: "#64748b", fontSize: 14, marginTop: 8, textAlign: "center", paddingHorizontal: 30 },
  songRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#1e293b", borderRadius: 14, padding: 12, marginBottom: 8 },
  rank: { color: "#475569", fontSize: 14, fontWeight: "800", width: 22 },
  songTitleRow: { flexDirection: "row", alignItems: "center" },
  sourceIcon: { fontSize: 10, marginRight: 6 },
  songTitle: { color: "#ffffff", fontSize: 15, fontWeight: "600", flex: 1 },
  songArtist: { color: "#94a3b8", fontSize: 13, marginTop: 1 },
  songSource: { color: "#475569", fontSize: 11, marginTop: 2 },
  voteBox: { alignItems: "center", marginLeft: 8, width: 40 },
  arrow: { color: "#475569", fontSize: 16, paddingVertical: 2 },
  arrowUp: { color: "#22c55e" },
  arrowDown: { color: "#f87171" },
  score: { color: "#ffffff", fontSize: 14, fontWeight: "800", paddingVertical: 2 },
  fab: { position: "absolute", bottom: 20, right: 16, left: 16, backgroundColor: "#6366f1", borderRadius: 16, padding: 16, alignItems: "center" },
  fabText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modal: { backgroundColor: "#0f172a", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { color: "#ffffff", fontSize: 20, fontWeight: "800" },
  modalClose: { color: "#64748b", fontSize: 20 },
  label: { color: "#cbd5e1", fontSize: 14, fontWeight: "600", marginBottom: 8 },
  input: { backgroundColor: "#1e293b", borderRadius: 14, padding: 14, color: "#ffffff", fontSize: 15, marginBottom: 12, borderWidth: 1, borderColor: "#334155" },
  hint: { color: "#64748b", fontSize: 12, marginBottom: 14, lineHeight: 17 },
  button: { backgroundColor: "#6366f1", borderRadius: 16, padding: 16, alignItems: "center" },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
});
