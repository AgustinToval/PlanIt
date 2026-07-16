// Bottom-sheet with someone's public profile. Opened by tapping a name in a
// chat or a members list. Shows avatar, username#tag, bio and the right
// friendship action (add / sent / friends). Email is never shown.
import { useEffect, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, Image, Alert, ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
import { font, radius, shadow, userColor, Palette, themedStyles } from "../lib/theme";
import { useTheme, useT } from "../hooks/useSettings";

type PublicProfile = {
  id: string;
  name: string | null;
  username: string | null;
  tag: string | null;
  avatar: string | null;
  bio: string | null;
  location: string | null;
  createdAt: string;
  _count: { planMembers: number; groupMembers: number; photos: number };
  friendship: "self" | "friends" | "sent" | "incoming" | "none";
};

export default function UserProfileSheet({
  userId, onClose,
}: { userId: string | null; onClose: () => void }) {
  const c = useTheme();
  const styles = getStyles(c);
  const t = useT();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setProfile(null);
    setError(null);
    if (!userId) return;
    api.get(`/users/profile/${userId}`)
      .then((res) => setProfile(res.data))
      .catch((e) => setError(e?.response?.data?.error ?? "Could not load this profile"));
  }, [userId]);

  const addFriend = async () => {
    if (!profile) return;
    setBusy(true);
    try {
      const res = await api.post("/friends", { userId: profile.id });
      setProfile({ ...profile, friendship: res.data.autoAccepted ? "friends" : "sent" });
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.error ?? "Could not send request");
    } finally {
      setBusy(false);
    }
  };

  const handle = profile?.username
    ? `@${profile.username}${profile.tag ? `#${profile.tag}` : ""}`
    : null;

  return (
    <Modal visible={userId !== null} animationType="slide" transparent>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{t("scr.profile")}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={c.muted} />
            </TouchableOpacity>
          </View>

          {error ? (
            <Text style={styles.error}>{error}</Text>
          ) : !profile ? (
            <ActivityIndicator color={c.orange} style={{ marginVertical: 40 }} />
          ) : (
            <>
              <View style={styles.top}>
                {profile.avatar ? (
                  <Image source={{ uri: profile.avatar }} style={styles.avatarImg} />
                ) : (
                  <View style={[styles.avatar, { backgroundColor: userColor(profile.id) }]}>
                    <Text style={styles.avatarText}>
                      {(profile.name ?? profile.username ?? "?")[0]?.toUpperCase()}
                    </Text>
                  </View>
                )}
                <Text style={styles.name}>{profile.name ?? profile.username ?? "?"}</Text>
                {handle && <Text style={styles.handle}>{handle}</Text>}
                {profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}
                {profile.location && (
                  <View style={styles.locRow}>
                    <Ionicons name="location-outline" size={13} color={c.faint} />
                    <Text style={styles.loc}>{profile.location}</Text>
                  </View>
                )}
              </View>

              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Text style={styles.statNum}>{profile._count.planMembers}</Text>
                  <Text style={styles.statLabel}>Plans</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statNum}>{profile._count.groupMembers}</Text>
                  <Text style={styles.statLabel}>Groups</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statNum}>{profile._count.photos}</Text>
                  <Text style={styles.statLabel}>Photos</Text>
                </View>
              </View>

              {profile.friendship === "none" && (
                <TouchableOpacity
                  style={[styles.addBtn, busy && { opacity: 0.5 }]}
                  onPress={addFriend}
                  disabled={busy}
                >
                  <Ionicons name="person-add-outline" size={16} color={c.onOrange} />
                  <Text style={styles.addBtnText}>{t("sheet.addFriend")}</Text>
                </TouchableOpacity>
              )}
              {profile.friendship === "sent" && (
                <View style={styles.stateRow}>
                  <Ionicons name="time-outline" size={15} color={c.teal} />
                  <Text style={styles.stateText}>{t("sheet.sent")}</Text>
                </View>
              )}
              {profile.friendship === "incoming" && (
                <View style={styles.stateRow}>
                  <Ionicons name="mail-unread-outline" size={15} color={c.orange} />
                  <Text style={[styles.stateText, { color: c.orange }]}>
                    Sent you a friend request — check Notifications
                  </Text>
                </View>
              )}
              {profile.friendship === "friends" && (
                <View style={styles.stateRow}>
                  <Ionicons name="checkmark-circle" size={15} color={c.teal} />
                  <Text style={styles.stateText}>{t("sheet.friends")}</Text>
                </View>
              )}
            </>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const getStyles = themedStyles((c: Palette) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(7,32,48,0.55)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: c.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 40,
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  headerTitle: { color: c.ink, fontSize: 19, fontFamily: font.title },
  error: { color: c.muted, fontSize: 13.5, fontFamily: font.bodyMedium, textAlign: "center", marginVertical: 30 },
  top: { alignItems: "center", marginBottom: 18 },
  avatar: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  avatarImg: { width: 76, height: 76, borderRadius: 38, marginBottom: 10 },
  avatarText: { color: "#fff", fontSize: 28, fontFamily: font.title },
  name: { color: c.ink, fontSize: 20, fontFamily: font.title, letterSpacing: -0.3 },
  handle: { color: c.teal, fontSize: 14, fontFamily: font.bodySemi, marginTop: 2 },
  bio: {
    color: c.muted, fontSize: 13.5, fontFamily: font.body, textAlign: "center",
    marginTop: 8, paddingHorizontal: 24, lineHeight: 20,
  },
  locRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  loc: { color: c.faint, fontSize: 12.5, fontFamily: font.bodyMedium },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  stat: {
    flex: 1, backgroundColor: c.surface, borderRadius: radius.lg, padding: 13,
    alignItems: "center", borderWidth: 1, borderColor: c.line,
  },
  statNum: { color: c.ink, fontSize: 20, fontFamily: font.title },
  statLabel: { color: c.muted, fontSize: 11.5, fontFamily: font.bodyMedium, marginTop: 2 },
  addBtn: {
    flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 7,
    backgroundColor: c.orange, borderRadius: radius.md, padding: 14, ...shadow.orange,
  },
  addBtnText: { color: c.onOrange, fontSize: 14.5, fontFamily: font.semi },
  stateRow: {
    flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6,
    backgroundColor: c.surface, borderRadius: radius.md, padding: 13,
    borderWidth: 1, borderColor: c.line,
  },
  stateText: { color: c.teal, fontSize: 13.5, fontFamily: font.bodySemi },
}));
