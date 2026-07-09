import { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, RefreshControl,
  Platform, Alert,
} from "react-native";
import * as Location from "expo-location";
import { api } from "../../lib/api";
import { getSocket } from "../../lib/socket";
import { useAuthStore } from "../../hooks/useAuthStore";
import MeetupMap from "./MeetupMap"; // resolves to .native.tsx on phone, .tsx on web

type Member = {
  rsvp: string;
  role: string;
  meetupStatus?: string;
  lat?: number | null;
  lng?: number | null;
  locationAt?: string | null;
  user: { id: string; name: string | null };
};

const STATUSES = [
  { key: "home", emoji: "🏠", label: "Not left yet" },
  { key: "onway", emoji: "🚗", label: "On my way" },
  { key: "there", emoji: "✅", label: "I'm there" },
] as const;

function statusInfo(key: string | undefined) {
  return STATUSES.find((s) => s.key === key) ?? { key: "none", emoji: "⚪", label: "No status" };
}

// Locations older than 10 minutes are considered stale
function isFresh(at: string | null | undefined): boolean {
  if (!at) return false;
  return Date.now() - new Date(at).getTime() < 10 * 60 * 1000;
}

export default function MeetupModule({ planId }: { planId: string }) {
  const { user } = useAuthStore();
  const [members, setMembers] = useState<Member[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const watcher = useRef<Location.LocationSubscription | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/plans/${planId}`);
      setMembers(res.data.members ?? []);
    } catch { /* noop */ }
  }, [planId]);

  useEffect(() => { load(); }, [load]);

  // Real-time: statuses reload, locations update markers directly
  useEffect(() => {
    const socket = getSocket();
    const onMeetup = () => load();
    const onLocation = (data: { userId: string; lat: number | null; lng: number | null; at: string | null }) => {
      setMembers((prev) =>
        prev.map((m) =>
          m.user.id === data.userId
            ? { ...m, lat: data.lat, lng: data.lng, locationAt: data.at }
            : m
        )
      );
    };
    socket.on("meetup:changed", onMeetup);
    socket.on("location:changed", onLocation);
    return () => {
      socket.off("meetup:changed", onMeetup);
      socket.off("location:changed", onLocation);
    };
  }, [load]);

  // Stop sharing when leaving the screen
  useEffect(() => {
    return () => {
      watcher.current?.remove();
      watcher.current = null;
    };
  }, []);

  const startSharing = async () => {
    if (Platform.OS === "web") {
      Alert.alert("Not on web", "Location sharing works from the phone app.");
      return;
    }
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow location access to share where you are.");
      return;
    }
    setSharing(true);
    watcher.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, timeInterval: 8000, distanceInterval: 25 },
      async (pos) => {
        try {
          await api.post(`/plans/${planId}/location`, {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
        } catch { /* noop */ }
      }
    );
  };

  const stopSharing = async () => {
    watcher.current?.remove();
    watcher.current = null;
    setSharing(false);
    try {
      await api.post(`/plans/${planId}/location`, { lat: null, lng: null });
    } catch { /* noop */ }
  };

  const myStatus = members.find((m) => m.user.id === user?.id)?.meetupStatus ?? "none";

  const setStatus = async (status: string) => {
    const next = myStatus === status ? "none" : status;
    setMembers((prev) =>
      prev.map((m) => (m.user.id === user?.id ? { ...m, meetupStatus: next } : m))
    );
    try {
      await api.post(`/plans/${planId}/meetup`, { status: next });
    } catch {
      await load();
    }
  };

  const located = members.filter((m) => m.lat != null && m.lng != null && isFresh(m.locationAt));
  const there = members.filter((m) => m.meetupStatus === "there").length;
  const onway = members.filter((m) => m.meetupStatus === "onway").length;

  const mapMembers = located.map((m) => ({
    id: m.user.id,
    name: m.user.id === user?.id ? "You" : m.user.name ?? "?",
    lat: m.lat!,
    lng: m.lng!,
    isMe: m.user.id === user?.id,
    statusLabel: statusInfo(m.meetupStatus).label,
  }));

  return (
    <ScrollView
      style={{ flex: 1, padding: 12 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor="#6366f1" />}
    >
      {/* Live map (native) / notice (web) */}
      {located.length > 0 ? (
        <MeetupMap members={mapMembers} />
      ) : (
        <View style={styles.mapEmpty}>
          <Text style={styles.mapEmptyText}>🗺️ No one is sharing location yet</Text>
        </View>
      )}

      {/* Share location toggle */}
      <TouchableOpacity
        style={[styles.shareBtn, sharing && styles.shareBtnActive]}
        onPress={sharing ? stopSharing : startSharing}
      >
        <Text style={styles.shareBtnText}>
          {sharing ? "🔴 Stop sharing my location" : "📍 Share my live location"}
        </Text>
      </TouchableOpacity>

      {/* My status */}
      <Text style={styles.sectionTitle}>Your status</Text>
      <View style={styles.statusRow}>
        {STATUSES.map((s) => (
          <TouchableOpacity
            key={s.key}
            style={[styles.statusBtn, myStatus === s.key && styles.statusBtnActive]}
            onPress={() => setStatus(s.key)}
          >
            <Text style={styles.statusEmoji}>{s.emoji}</Text>
            <Text style={[styles.statusLabel, myStatus === s.key && styles.statusLabelActive]}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Summary */}
      <View style={styles.summary}>
        <Text style={styles.summaryText}>
          ✅ {there} there · 🚗 {onway} on the way · 📍 {located.length} sharing location
        </Text>
      </View>

      {/* Everyone */}
      <Text style={styles.sectionTitle}>Who's where</Text>
      {members.map((m) => {
        const info = statusInfo(m.meetupStatus);
        const isMe = m.user.id === user?.id;
        const hasLoc = m.lat != null && isFresh(m.locationAt);
        return (
          <View key={m.user.id} style={styles.memberRow}>
            <Text style={styles.memberEmoji}>{info.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.memberName}>{isMe ? "You" : m.user.name ?? "?"}</Text>
              {hasLoc && <Text style={styles.memberLoc}>📍 sharing live location</Text>}
            </View>
            <Text style={styles.memberStatus}>{info.label}</Text>
          </View>
        );
      })}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  mapWrap: { borderRadius: 16, overflow: "hidden", marginBottom: 12 },
  map: { width: "100%", height: 260 },
  mapEmpty: { backgroundColor: "#1e293b", borderRadius: 16, padding: 24, alignItems: "center", marginBottom: 12 },
  mapEmptyText: { color: "#64748b", fontSize: 14 },
  shareBtn: { backgroundColor: "#312e81", borderRadius: 14, padding: 14, alignItems: "center", marginBottom: 16 },
  shareBtnActive: { backgroundColor: "#450a0a" },
  shareBtnText: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  sectionTitle: { color: "#94a3b8", fontSize: 14, fontWeight: "700", marginBottom: 10, marginTop: 8 },
  statusRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  statusBtn: {
    flex: 1, backgroundColor: "#1e293b", borderRadius: 16, padding: 14,
    alignItems: "center", borderWidth: 2, borderColor: "transparent",
  },
  statusBtnActive: { borderColor: "#6366f1", backgroundColor: "#312e81" },
  statusEmoji: { fontSize: 26, marginBottom: 6 },
  statusLabel: { color: "#94a3b8", fontSize: 12, fontWeight: "600", textAlign: "center" },
  statusLabelActive: { color: "#ffffff" },
  summary: { backgroundColor: "#1e293b", borderRadius: 14, padding: 14, alignItems: "center", marginBottom: 16 },
  summaryText: { color: "#e2e8f0", fontSize: 13, fontWeight: "600" },
  memberRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#1e293b", borderRadius: 14, padding: 14, marginBottom: 8 },
  memberEmoji: { fontSize: 20, marginRight: 12 },
  memberName: { color: "#ffffff", fontSize: 15, fontWeight: "600" },
  memberLoc: { color: "#22c55e", fontSize: 11, marginTop: 2 },
  memberStatus: { color: "#64748b", fontSize: 13 },
});
