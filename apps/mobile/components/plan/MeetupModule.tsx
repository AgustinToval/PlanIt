import { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, RefreshControl,
  Platform, Alert,
} from "react-native";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../lib/api";
import { getSocket } from "../../lib/socket";
import { useAuthStore } from "../../hooks/useAuthStore";
import MeetupMap from "./MeetupMap"; // resolves to .native.tsx on phone, .tsx on web
import { colors, font, radius, shadow, userColor } from "../../lib/theme";

type Member = {
  rsvp: string;
  role: string;
  meetupStatus?: string;
  lat?: number | null;
  lng?: number | null;
  locationAt?: string | null;
  user: { id: string; name: string | null };
};

type StatusIcon = "home-outline" | "car-outline" | "checkmark-circle-outline" | "ellipse-outline";

const STATUSES: { key: string; icon: StatusIcon; label: string; color: string }[] = [
  { key: "home", icon: "home-outline", label: "Not left yet", color: "#5E7688" },
  { key: "onway", icon: "car-outline", label: "On my way", color: "#F77F00" },
  { key: "there", icon: "checkmark-circle-outline", label: "I'm there", color: "#0892A5" },
];

function statusInfo(key: string | undefined) {
  return STATUSES.find((s) => s.key === key)
    ?? { key: "none", icon: "ellipse-outline" as StatusIcon, label: "No status", color: "#8FA6B5" };
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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.orange} />}
    >
      {/* Live map (native) / notice (web) */}
      {located.length > 0 ? (
        <MeetupMap members={mapMembers} />
      ) : (
        <View style={styles.mapEmpty}>
          <Ionicons name="map-outline" size={22} color={colors.faint} />
          <Text style={styles.mapEmptyText}>No one is sharing location yet</Text>
        </View>
      )}

      {/* Share location toggle */}
      <TouchableOpacity
        style={[styles.shareBtn, sharing && styles.shareBtnActive]}
        onPress={sharing ? stopSharing : startSharing}
      >
        <Ionicons
          name={sharing ? "stop-circle-outline" : "location-outline"}
          size={17}
          color="#fff"
        />
        <Text style={styles.shareBtnText}>
          {sharing ? "Stop sharing my location" : "Share my live location"}
        </Text>
      </TouchableOpacity>

      {/* My status */}
      <Text style={styles.sectionTitle}>Your status</Text>
      <View style={styles.statusRow}>
        {STATUSES.map((s) => {
          const active = myStatus === s.key;
          return (
            <TouchableOpacity
              key={s.key}
              style={[styles.statusBtn, active && { borderColor: s.color, backgroundColor: `${s.color}18` }]}
              onPress={() => setStatus(s.key)}
            >
              <Ionicons name={s.icon} size={22} color={active ? s.color : colors.faint} style={{ marginBottom: 6 }} />
              <Text style={[styles.statusLabel, active && { color: colors.ink }]}>
                {s.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Summary */}
      <View style={styles.summary}>
        <Text style={styles.summaryText}>
          {there} there · {onway} on the way · {located.length} sharing location
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
            <View style={[styles.memberAvatar, { backgroundColor: userColor(m.user.id) }]}>
              <Text style={styles.memberAvatarText}>{(m.user.name ?? "?")[0]?.toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.memberName}>{isMe ? "You" : m.user.name ?? "?"}</Text>
              {hasLoc && (
                <View style={styles.memberLocRow}>
                  <Ionicons name="location" size={11} color={colors.teal} />
                  <Text style={styles.memberLoc}>sharing live location</Text>
                </View>
              )}
            </View>
            <Ionicons name={info.icon} size={16} color={info.color} style={{ marginRight: 6 }} />
            <Text style={[styles.memberStatus, { color: info.color }]}>{info.label}</Text>
          </View>
        );
      })}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  mapWrap: { borderRadius: radius.lg, overflow: "hidden", marginBottom: 12 },
  map: { width: "100%", height: 260 },
  mapEmpty: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: 24,
    alignItems: "center", marginBottom: 12, gap: 6, borderWidth: 1, borderColor: colors.line,
  },
  mapEmptyText: { color: colors.muted, fontSize: 13.5, fontFamily: font.bodyMedium },
  shareBtn: {
    flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 7,
    backgroundColor: colors.teal, borderRadius: radius.md, padding: 14,
    marginBottom: 16, ...shadow.card,
  },
  shareBtnActive: { backgroundColor: colors.danger },
  shareBtnText: { color: "#fff", fontSize: 14, fontFamily: font.semi },
  sectionTitle: {
    color: colors.muted, fontSize: 11, fontFamily: font.semi, letterSpacing: 1,
    textTransform: "uppercase", marginBottom: 10, marginTop: 8,
  },
  statusRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  statusBtn: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14,
    alignItems: "center", borderWidth: 1.5, borderColor: colors.line,
  },
  statusLabel: { color: colors.muted, fontSize: 11.5, fontFamily: font.semi, textAlign: "center" },
  summary: {
    backgroundColor: colors.surface, borderRadius: radius.md, padding: 14,
    alignItems: "center", marginBottom: 16, borderWidth: 1, borderColor: colors.line,
  },
  summaryText: { color: colors.ink, fontSize: 12.5, fontFamily: font.bodySemi },
  memberRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.surface,
    borderRadius: radius.md, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.line,
  },
  memberAvatar: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", marginRight: 11 },
  memberAvatarText: { color: "#fff", fontFamily: font.semi, fontSize: 13 },
  memberName: { color: colors.ink, fontSize: 14, fontFamily: font.bodySemi },
  memberLocRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 },
  memberLoc: { color: colors.teal, fontSize: 11, fontFamily: font.bodyMedium },
  memberStatus: { fontSize: 12, fontFamily: font.bodySemi },
});
