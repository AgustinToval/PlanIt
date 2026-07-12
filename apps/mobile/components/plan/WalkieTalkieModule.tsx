import { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Platform, Modal,
} from "react-native";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import { api } from "../../lib/api";
import { getSocket } from "../../lib/socket";
import { useAuthStore } from "../../hooks/useAuthStore";

type Clip = {
  id: string;
  userId: string;
  name: string | null;
  duration: number;
  createdAt: string;
};

type Member = { rsvp: string; role: string; user: { id: string; name: string | null } };

export default function WalkieTalkieModule({
  planId, members = [],
}: { planId: string; members?: Member[] }) {
  const { user } = useAuthStore();
  const [clips, setClips] = useState<Clip[]>([]);
  const [recording, setRecording] = useState(false);
  const [sending, setSending] = useState(false);
  const [nowPlaying, setNowPlaying] = useState<string | null>(null);
  const [autoPlay, setAutoPlay] = useState(true);
  const [muteAll, setMuteAll] = useState(false);
  const [mutedUsers, setMutedUsers] = useState<Set<string>>(new Set());
  const [showMute, setShowMute] = useState(false);
  // pending | accepted | declined | loading — consent gate for the channel
  const [optIn, setOptIn] = useState<string>("loading");

  const recordingRef = useRef<Audio.Recording | null>(null);
  const startingRef = useRef<Promise<void> | null>(null); // in-flight start
  const recStartRef = useRef(0); // wall-clock start, for real duration
  const soundRef = useRef<Audio.Sound | null>(null);
  // Refs so the socket handler always reads current values
  const autoPlayRef = useRef(true);
  const muteAllRef = useRef(false);
  const mutedRef = useRef<Set<string>>(new Set());
  useEffect(() => { autoPlayRef.current = autoPlay; }, [autoPlay]);
  useEffect(() => { muteAllRef.current = muteAll; }, [muteAll]);
  useEffect(() => { mutedRef.current = mutedUsers; }, [mutedUsers]);
  const optInRef = useRef("loading");
  useEffect(() => { optInRef.current = optIn; }, [optIn]);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/voice/plan/${planId}`);
      setClips(res.data);
    } catch { /* noop */ }
  }, [planId]);

  // Check my consent status first; only load clips once accepted
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get(`/voice/plan/${planId}/status`);
        setOptIn(res.data.walkieOptIn);
        if (res.data.walkieOptIn === "accepted") await load();
      } catch {
        setOptIn("pending");
      }
    })();
  }, [planId, load]);

  const respondOptIn = async (accept: boolean) => {
    try {
      const res = await api.post(`/voice/plan/${planId}/optin`, { accept });
      setOptIn(res.data.walkieOptIn);
      if (accept) await load();
    } catch {
      Alert.alert("Error", "Could not update your walkie status");
    }
  };

  // Real-time: a new clip arrived → add to list and auto-play unless muted
  useEffect(() => {
    const socket = getSocket();
    const onNew = (clip: Clip) => {
      if (optInRef.current !== "accepted") return; // not in the channel
      setClips((prev) => (prev.some((c) => c.id === clip.id) ? prev : [clip, ...prev]));
      const mine = clip.userId === user?.id;
      const muted = muteAllRef.current || mutedRef.current.has(clip.userId);
      if (autoPlayRef.current && !mine && !muted) {
        playClip(clip.id);
      }
    };
    const onDeleted = (data: { id: string }) => {
      setClips((prev) => prev.filter((c) => c.id !== data.id));
    };
    socket.on("voice:new", onNew);
    socket.on("voice:deleted", onDeleted);
    return () => {
      socket.off("voice:new", onNew);
      socket.off("voice:deleted", onDeleted);
    };
  }, [user?.id]);

  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
    };
  }, []);

  const startRecording = () => {
    if (Platform.OS === "web") {
      Alert.alert("Not on web", "The walkie talkie works from the phone app.");
      return;
    }
    setRecording(true);
    // Starting takes ~0.5s (permission + mic warm-up). Track the promise so a
    // quick release can wait for it instead of finding no recording.
    startingRef.current = (async () => {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        throw new Error("Microphone permission denied");
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      recStartRef.current = Date.now();
    })();
    startingRef.current.catch((e: any) => {
      setRecording(false);
      Alert.alert("Error", e?.message ?? "Could not start recording");
    });
  };

  const stopAndSend = async () => {
    setRecording(false);
    // If the user released before the mic finished starting, wait for it
    try { await startingRef.current; } catch { return; }
    const rec = recordingRef.current;
    if (!rec) return;

    setSending(true);
    try {
      const durationMs = Date.now() - recStartRef.current; // real wall-clock duration
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      recordingRef.current = null;
      if (!uri) throw new Error("No audio was recorded");

      // ignore accidental taps shorter than ~0.7s
      if (durationMs < 700) { setSending(false); return; }

      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const dataUrl = `data:audio/m4a;base64,${base64}`;
      if (dataUrl.length > 8_000_000) {
        Alert.alert("Too long", "Keep messages under ~1 minute.");
        return;
      }
      await api.post(
        `/voice/plan/${planId}`,
        { url: dataUrl, duration: Math.max(1, Math.round(durationMs / 1000)) },
        { timeout: 30000 }
      );
      await load();
    } catch (e: any) {
      Alert.alert("Send error", e?.response?.data?.error ?? e?.message ?? "Could not send the message");
    } finally {
      setSending(false);
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
    }
  };

  const playClip = async (clipId: string) => {
    try {
      setNowPlaying(clipId);
      await soundRef.current?.unloadAsync().catch(() => {});
      // Play even on silent mode, and through the loud speaker (not earpiece)
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        allowsRecordingIOS: false,
      });

      const res = await api.get(`/voice/${clipId}`);
      const dataUrl: string = res.data.url;

      // iOS can't play data: URIs — write the audio to a temp file first
      const base64 = dataUrl.split(",")[1] ?? "";
      if (!base64) throw new Error("empty clip");
      const fileUri = `${FileSystem.cacheDirectory}voice_${clipId}.m4a`;
      await FileSystem.writeAsStringAsync(fileUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri: fileUri },
        { shouldPlay: true, volume: 1.0 }
      );
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((s: any) => {
        if (s.didJustFinish) {
          setNowPlaying(null);
          sound.unloadAsync().catch(() => {});
          FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
        }
      });
    } catch (e: any) {
      setNowPlaying(null);
      Alert.alert("Playback error", e?.message ?? "Could not play this clip");
    }
  };

  const deleteClip = (clip: Clip) => {
    if (clip.userId !== user?.id) return; // UI: only the sender long-presses own clips
    Alert.alert("Delete voice message?", "It will be removed for everyone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/voice/${clip.id}`);
            setClips((prev) => prev.filter((c) => c.id !== clip.id));
          } catch (e: any) {
            Alert.alert("Error", e?.response?.data?.error ?? "Could not delete");
          }
        },
      },
    ]);
  };

  const toggleMuteUser = (uid: string) => {
    setMutedUsers((prev) => {
      const next = new Set(prev);
      next.has(uid) ? next.delete(uid) : next.add(uid);
      return next;
    });
  };

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  const others = members.filter((m) => m.user.id !== user?.id);
  const mutedCount = muteAll ? others.length : mutedUsers.size;

  // Consent gate — you must join the channel before sending or hearing anything
  if (optIn !== "accepted") {
    return (
      <View style={styles.gate}>
        <Text style={styles.gateEmoji}>🎙️</Text>
        <Text style={styles.gateTitle}>Join the walkie talkie?</Text>
        <Text style={styles.gateText}>
          If you join, voice messages from this plan will play on your phone
          while you're in this tab. You can mute people or leave anytime.
        </Text>
        {optIn === "loading" ? null : (
          <>
            <TouchableOpacity style={styles.gateJoin} onPress={() => respondOptIn(true)}>
              <Text style={styles.gateJoinText}>✅ Join channel</Text>
            </TouchableOpacity>
            {optIn !== "declined" && (
              <TouchableOpacity style={styles.gateDecline} onPress={() => respondOptIn(false)}>
                <Text style={styles.gateDeclineText}>Not now</Text>
              </TouchableOpacity>
            )}
            {optIn === "declined" && (
              <Text style={styles.gateHint}>You declined — you can join whenever you want.</Text>
            )}
          </>
        )}
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Top bar: auto-play + mute */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => setAutoPlay((v) => !v)}>
          <Text style={styles.topText}>{autoPlay ? "🔊 Auto-play ON" : "🔇 Auto-play OFF"}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowMute(true)}>
          <Text style={styles.topText}>
            🔕 Mute{mutedCount > 0 ? ` (${mutedCount})` : ""}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Recent clips */}
      <ScrollView style={{ flex: 1, paddingHorizontal: 12 }}>
        {clips.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🎙️</Text>
            <Text style={styles.emptyText}>No messages yet</Text>
            <Text style={styles.emptySub}>Hold the button below to talk</Text>
          </View>
        ) : (
          clips.map((clip) => {
            const mine = clip.userId === user?.id;
            const playing = nowPlaying === clip.id;
            const isMuted = muteAll || mutedUsers.has(clip.userId);
            return (
              <TouchableOpacity
                key={clip.id}
                style={[styles.clipRow, playing && styles.clipPlaying]}
                onPress={() => playClip(clip.id)}
                onLongPress={() => deleteClip(clip)}
              >
                <Text style={styles.clipIcon}>{playing ? "▶️" : "🔈"}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.clipName}>
                    {mine ? "You" : clip.name ?? "?"}{isMuted && !mine ? "  🔕" : ""}
                  </Text>
                  <Text style={styles.clipMeta}>
                    {clip.duration > 0 ? `${clip.duration}s · ` : ""}{timeAgo(clip.createdAt)}
                  </Text>
                </View>
                <Text style={styles.clipTap}>{mine ? "hold to delete" : "tap to play"}</Text>
              </TouchableOpacity>
            );
          })
        )}
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Push-to-talk button */}
      <View style={styles.talkWrap}>
        <TouchableOpacity
          activeOpacity={0.9}
          style={[styles.talkBtn, recording && styles.talkBtnActive, sending && { opacity: 0.6 }]}
          onPressIn={startRecording}
          onPressOut={stopAndSend}
          disabled={sending}
        >
          <Text style={styles.talkEmoji}>{recording ? "🔴" : "🎙️"}</Text>
          <Text style={styles.talkText}>
            {sending ? "Sending..." : recording ? "Release to send" : "Hold to talk"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Mute modal */}
      <Modal visible={showMute} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🔕 Mute</Text>
              <TouchableOpacity onPress={() => setShowMute(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.muteAllRow, muteAll && styles.muteRowActive]}
              onPress={() => setMuteAll((v) => !v)}
            >
              <Text style={styles.muteAllText}>Mute everyone</Text>
              <Text style={styles.muteToggle}>{muteAll ? "🔕 ON" : "🔔 OFF"}</Text>
            </TouchableOpacity>

            {!muteAll && (
              <ScrollView style={{ maxHeight: 340 }}>
                {others.length === 0 ? (
                  <Text style={styles.hint}>No other members in this plan yet.</Text>
                ) : (
                  others.map((m) => {
                    const muted = mutedUsers.has(m.user.id);
                    return (
                      <TouchableOpacity
                        key={m.user.id}
                        style={[styles.muteRow, muted && styles.muteRowActive]}
                        onPress={() => toggleMuteUser(m.user.id)}
                      >
                        <Text style={styles.muteName}>{m.user.name ?? "?"}</Text>
                        <Text style={styles.muteToggle}>{muted ? "🔕 Muted" : "🔔 On"}</Text>
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            )}
            {muteAll && <Text style={styles.hint}>Everyone is muted — no incoming voice will auto-play.</Text>}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10 },
  topText: { color: "#818cf8", fontSize: 13, fontWeight: "700" },
  empty: { alignItems: "center", marginTop: 50 },
  emptyIcon: { fontSize: 56 },
  emptyText: { color: "#ffffff", fontSize: 20, fontWeight: "700", marginTop: 16 },
  emptySub: { color: "#64748b", fontSize: 14, marginTop: 8 },
  clipRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#1e293b", borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 2, borderColor: "transparent" },
  clipPlaying: { borderColor: "#22c55e" },
  clipIcon: { fontSize: 22, marginRight: 12 },
  clipName: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  clipMeta: { color: "#64748b", fontSize: 12, marginTop: 2 },
  clipTap: { color: "#475569", fontSize: 11 },
  talkWrap: { padding: 16, borderTopWidth: 1, borderTopColor: "#1e293b" },
  talkBtn: { backgroundColor: "#6366f1", borderRadius: 20, paddingVertical: 22, alignItems: "center", justifyContent: "center" },
  talkBtnActive: { backgroundColor: "#dc2626" },
  talkEmoji: { fontSize: 34, marginBottom: 6 },
  talkText: { color: "#ffffff", fontSize: 17, fontWeight: "800" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modal: { backgroundColor: "#0f172a", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { color: "#ffffff", fontSize: 20, fontWeight: "800" },
  modalClose: { color: "#64748b", fontSize: 20 },
  muteAllRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#1e293b", borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 2, borderColor: "transparent" },
  muteAllText: { color: "#ffffff", fontSize: 16, fontWeight: "800" },
  muteRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#1e293b", borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 2, borderColor: "transparent" },
  muteRowActive: { borderColor: "#ef4444" },
  muteName: { color: "#e2e8f0", fontSize: 15, fontWeight: "600" },
  muteToggle: { color: "#94a3b8", fontSize: 13, fontWeight: "700" },
  hint: { color: "#64748b", fontSize: 13, textAlign: "center", paddingVertical: 12 },
  gate: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  gateEmoji: { fontSize: 60, marginBottom: 16 },
  gateTitle: { color: "#ffffff", fontSize: 22, fontWeight: "800", marginBottom: 10 },
  gateText: { color: "#94a3b8", fontSize: 15, textAlign: "center", lineHeight: 22, marginBottom: 26 },
  gateJoin: { backgroundColor: "#6366f1", borderRadius: 16, paddingHorizontal: 32, paddingVertical: 16, marginBottom: 12 },
  gateJoinText: { color: "#ffffff", fontSize: 16, fontWeight: "800" },
  gateDecline: { paddingVertical: 10 },
  gateDeclineText: { color: "#64748b", fontSize: 15, fontWeight: "600" },
  gateHint: { color: "#475569", fontSize: 13, marginTop: 8 },
});
