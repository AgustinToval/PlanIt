import { useCallback, useRef, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  Alert, RefreshControl, Modal, Image,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
import { font, radius, shadow, userColor, Palette, themedStyles } from "../lib/theme";
import { useTheme, useT } from "../hooks/useSettings";

type Friend = { id: string; name: string | null; username: string | null; tag?: string; avatar: string | null };
type FriendRequest = { id: string; createdAt: string; from: Friend };
type SearchResult = {
  id: string; name: string | null; username: string | null; tag: string;
  avatar: string | null; bio: string | null;
};
type Profile = {
  id: string; name: string | null; username: string | null; tag?: string;
  bio: string | null; location: string | null; createdAt: string;
  _count: { planMembers: number; groupMembers: number; photos: number };
};

// "@username#1234" display helper
const handleOf = (u: { username: string | null; tag?: string }) =>
  u.username ? `@${u.username}${u.tag ? `#${u.tag}` : ""}` : null;

export default function FriendsScreen() {
  const c = useTheme();
  const styles = getStyles(c);
  const t = useT();
  const router = useRouter();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = async () => {
    try {
      const [f, r] = await Promise.all([
        api.get("/friends"),
        api.get("/friends/requests"),
      ]);
      setFriends(f.data);
      setRequests(r.data);
    } catch { /* noop */ }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  // Live search while typing (debounced)
  const onQueryChange = (text: string) => {
    setQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = text.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await api.get(`/users/search?q=${encodeURIComponent(q)}`);
        setResults(res.data);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
  };

  const addFriendById = async (target: SearchResult) => {
    setBusy(true);
    try {
      const res = await api.post("/friends", { userId: target.id });
      setSentIds((prev) => new Set(prev).add(target.id));
      await load();
      if (res.data.autoAccepted) {
        Alert.alert(t("fr.nowFriends"), `${res.data.name} ${t("fr.alreadySent")}`);
      }
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.error ?? "Could not send request");
    } finally {
      setBusy(false);
    }
  };

  const respond = async (r: FriendRequest, action: "accept" | "decline") => {
    try {
      await api.post(`/friends/requests/${r.id}/${action}`);
      await load();
    } catch { /* noop */ }
  };

  const openProfile = async (f: Friend) => {
    try {
      const res = await api.get(`/friends/${f.id}/profile`);
      setProfile(res.data);
    } catch {
      Alert.alert("Error", "Could not load profile");
    }
  };

  const removeFriend = (f: Friend) => {
    Alert.alert(t("fr.removeQ"), f.name ?? "This user", [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.remove"), style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/friends/${f.id}`);
            await load();
          } catch { /* noop */ }
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={styles.container}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={c.orange} />}
    >
      <TouchableOpacity onPress={() => router.back()} style={styles.back}>
        <Ionicons name="chevron-back" size={18} color={c.teal} />
        <Text style={styles.backText}>{t("common.back")}</Text>
      </TouchableOpacity>

      <Text style={styles.title}>{t("scr.friends")}</Text>

      <Text style={styles.label}>{t("fr.addFriend")}</Text>
      <View style={styles.inputWrap}>
        <Ionicons name="search" size={16} color={c.faint} />
        <TextInput
          style={styles.input}
          placeholder={t("fr.searchPh")}
          placeholderTextColor={c.faint}
          value={query}
          onChangeText={onQueryChange}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => onQueryChange("")}>
            <Ionicons name="close-circle" size={17} color={c.faint} />
          </TouchableOpacity>
        )}
      </View>

      {/* Live search results */}
      {query.trim().length >= 2 && (
        <View style={{ marginTop: 10 }}>
          {searching && results.length === 0 ? (
            <Text style={styles.empty}>{t("fr.searching")}</Text>
          ) : results.length === 0 ? (
            <Text style={styles.empty}>{t("fr.noResults")}</Text>
          ) : (
            results.map((r) => {
              const alreadyFriend = friends.some((f) => f.id === r.id);
              const sent = sentIds.has(r.id);
              return (
                <View key={r.id} style={styles.friendRow}>
                  {r.avatar ? (
                    <Image source={{ uri: r.avatar }} style={styles.avatarImg} />
                  ) : (
                    <View style={[styles.avatar, { backgroundColor: userColor(r.id) }]}>
                      <Text style={styles.avatarText}>{(r.name ?? r.username ?? "?")[0]?.toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.friendName}>{r.name ?? r.username ?? "?"}</Text>
                    {handleOf(r) && <Text style={styles.friendMeta}>{handleOf(r)}</Text>}
                    {r.bio ? <Text style={styles.friendMeta} numberOfLines={1}>{r.bio}</Text> : null}
                  </View>
                  {alreadyFriend ? (
                    <Text style={styles.sentTag}>{t("fr.already")}</Text>
                  ) : sent ? (
                    <Text style={styles.sentTag}>{t("fr.sentTag")}</Text>
                  ) : (
                    <TouchableOpacity
                      style={[styles.acceptBtn, busy && { opacity: 0.5 }]}
                      onPress={() => addFriendById(r)}
                      disabled={busy}
                    >
                      <Text style={styles.acceptText}>{t("common.add")}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )}
        </View>
      )}

      {/* Incoming requests */}
      {requests.length > 0 && (
        <>
          <Text style={[styles.label, { marginTop: 24 }]}>
            {t("fr.requests")} ({requests.length})
          </Text>
          {requests.map((r) => (
            <View key={r.id} style={[styles.friendRow, styles.requestRow]}>
              <View style={[styles.avatar, { backgroundColor: userColor(r.from.id) }]}>
                <Text style={styles.avatarText}>{(r.from.name ?? "?")[0]?.toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.friendName}>{r.from.name ?? "?"}</Text>
                {handleOf(r.from) && <Text style={styles.friendMeta}>{handleOf(r.from)}</Text>}
              </View>
              <TouchableOpacity style={styles.acceptBtn} onPress={() => respond(r, "accept")}>
                <Text style={styles.acceptText}>{t("common.accept")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.declineBtn} onPress={() => respond(r, "decline")}>
                <Ionicons name="close" size={15} color={c.muted} />
              </TouchableOpacity>
            </View>
          ))}
        </>
      )}

      <Text style={[styles.label, { marginTop: 24 }]}>
        {t("fr.yourFriends")} ({friends.length})
      </Text>
      {friends.length === 0 ? (
        <Text style={styles.empty}>
          {t("fr.empty")}
        </Text>
      ) : (
        friends.map((f) => (
          <TouchableOpacity
            key={f.id}
            style={styles.friendRow}
            onPress={() => openProfile(f)}
            onLongPress={() => removeFriend(f)}
          >
            <View style={[styles.avatar, { backgroundColor: userColor(f.id) }]}>
              <Text style={styles.avatarText}>{(f.name ?? "?")[0]?.toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.friendName}>{f.name ?? "?"}</Text>
              {handleOf(f) && <Text style={styles.friendMeta}>{handleOf(f)}</Text>}
            </View>
            <Ionicons name="chevron-forward" size={17} color={c.faint} />
          </TouchableOpacity>
        ))
      )}
      <Text style={styles.hint}>{t("fr.hint")}</Text>

      {/* Friend profile modal */}
      <Modal visible={profile !== null} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t("scr.profile")}</Text>
              <TouchableOpacity onPress={() => setProfile(null)}>
                <Ionicons name="close" size={22} color={c.muted} />
              </TouchableOpacity>
            </View>

            {profile && (
              <>
                <View style={styles.profileTop}>
                  <View style={[styles.bigAvatar, { backgroundColor: userColor(profile.id) }]}>
                    <Text style={styles.bigAvatarText}>{(profile.name ?? "?")[0]?.toUpperCase()}</Text>
                  </View>
                  <Text style={styles.profileName}>{profile.name ?? "?"}</Text>
                  {handleOf(profile) && <Text style={styles.profileUsername}>{handleOf(profile)}</Text>}
                  {profile.bio && <Text style={styles.profileBio}>{profile.bio}</Text>}
                </View>

                <View style={styles.infoBox}>
                  {profile.location && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>{t("fr.location")}</Text>
                      <Text style={styles.infoValue}>{profile.location}</Text>
                    </View>
                  )}
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>{t("fr.joined")}</Text>
                    <Text style={styles.infoValue}>
                      {new Date(profile.createdAt).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
                    </Text>
                  </View>
                </View>

                <View style={styles.statsRow}>
                  <View style={styles.stat}>
                    <Text style={styles.statNum}>{profile._count.planMembers}</Text>
                    <Text style={styles.statLabel}>{t("stats.plans")}</Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={styles.statNum}>{profile._count.groupMembers}</Text>
                    <Text style={styles.statLabel}>{t("stats.groups")}</Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={styles.statNum}>{profile._count.photos}</Text>
                    <Text style={styles.statLabel}>{t("stats.photos")}</Text>
                  </View>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const getStyles = themedStyles((c: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg, padding: 20, paddingTop: 60 },
  back: { flexDirection: "row", alignItems: "center", gap: 2, marginBottom: 16 },
  backText: { color: c.teal, fontSize: 15, fontFamily: font.bodySemi },
  title: { fontSize: 25, fontFamily: font.title, color: c.ink, letterSpacing: -0.5, marginBottom: 20 },
  label: { color: c.ink, fontSize: 13, fontFamily: font.bodySemi, marginBottom: 8 },
  addRow: { flexDirection: "row", gap: 8 },
  inputWrap: {
    flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.surface,
    borderRadius: radius.md, paddingHorizontal: 14, borderWidth: 1, borderColor: c.line,
  },
  input: { flex: 1, paddingVertical: 13, color: c.ink, fontSize: 14.5, fontFamily: font.bodyMedium },
  addBtn: {
    backgroundColor: c.orange, borderRadius: radius.md, paddingHorizontal: 20,
    justifyContent: "center", ...shadow.orange,
  },
  addBtnText: { color: c.onOrange, fontFamily: font.semi, fontSize: 14 },
  empty: { color: c.muted, fontSize: 13.5, fontFamily: font.body, lineHeight: 20 },
  friendRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: c.surface,
    borderRadius: radius.lg, padding: 12, marginBottom: 9, borderWidth: 1, borderColor: c.line, ...shadow.card,
  },
  requestRow: { borderColor: c.orange },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", marginRight: 12 },
  avatarImg: { width: 42, height: 42, borderRadius: 21, marginRight: 12 },
  avatarText: { color: "#fff", fontFamily: font.title, fontSize: 16 },
  sentTag: { color: c.teal, fontSize: 12.5, fontFamily: font.semi, marginRight: 4 },
  friendName: { color: c.ink, fontSize: 15, fontFamily: font.bodySemi },
  friendMeta: { color: c.muted, fontSize: 12.5, fontFamily: font.body },
  acceptBtn: {
    backgroundColor: c.orange, borderRadius: radius.sm, paddingHorizontal: 14,
    paddingVertical: 8, marginRight: 6,
  },
  acceptText: { color: c.onOrange, fontSize: 12.5, fontFamily: font.semi },
  declineBtn: {
    backgroundColor: c.surface2, borderRadius: radius.sm, paddingHorizontal: 10,
    paddingVertical: 8, borderWidth: 1, borderColor: c.line,
  },
  hint: { color: c.faint, fontSize: 12, fontFamily: font.body, textAlign: "center", marginTop: 16, marginBottom: 40 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(7,32,48,0.55)", justifyContent: "flex-end" },
  modal: {
    backgroundColor: c.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 40,
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { color: c.ink, fontSize: 19, fontFamily: font.title },
  profileTop: { alignItems: "center", marginBottom: 20 },
  bigAvatar: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  bigAvatarText: { color: "#fff", fontSize: 30, fontFamily: font.title },
  profileName: { color: c.ink, fontSize: 21, fontFamily: font.title, letterSpacing: -0.3 },
  profileUsername: { color: c.teal, fontSize: 14, fontFamily: font.bodySemi, marginTop: 2 },
  profileBio: {
    color: c.muted, fontSize: 13.5, fontFamily: font.body, textAlign: "center",
    marginTop: 8, paddingHorizontal: 24, lineHeight: 20,
  },
  infoBox: {
    backgroundColor: c.surface, borderRadius: radius.lg, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: c.line,
  },
  infoRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
  infoLabel: { color: c.muted, fontSize: 13.5, fontFamily: font.bodyMedium },
  infoValue: { color: c.ink, fontSize: 13.5, fontFamily: font.bodySemi, flexShrink: 1, textAlign: "right" },
  statsRow: { flexDirection: "row", gap: 10 },
  stat: {
    flex: 1, backgroundColor: c.surface, borderRadius: radius.lg, padding: 14,
    alignItems: "center", borderWidth: 1, borderColor: c.line,
  },
  statNum: { color: c.ink, fontSize: 21, fontFamily: font.title },
  statLabel: { color: c.muted, fontSize: 11.5, fontFamily: font.bodyMedium, marginTop: 2 },
}));
