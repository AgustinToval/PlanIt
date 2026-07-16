import { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList,
  KeyboardAvoidingView, Platform, Modal, Alert, Image, ScrollView,
} from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { api } from "../../lib/api";
import { compressToDataUrl } from "../../lib/images";
import { getSocket } from "../../lib/socket";
import { useAuthStore } from "../../hooks/useAuthStore";
import { shareInvite } from "../../lib/invite";
import { useChatUx } from "../../hooks/useChatUx";
import UserProfileSheet from "../../components/UserProfileSheet";
import { font, radius, shadow, userColor, Palette, themedStyles } from "../../lib/theme";
import { useTheme, useT } from "../../hooks/useSettings";

type Message = {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; name: string | null; username?: string | null };
};

// Chat shows the username (without the #tag); falls back to the display name
const chatName = (u: Message["user"]) => u.username ?? u.name ?? "?";

type Group = {
  id: string;
  name: string;
  photo?: string | null;
  description: string | null;
  inviteCode: string;
  members: { role: string; muted?: boolean; user: { id: string; name: string | null } }[];
};

export default function GroupScreen() {
  const c = useTheme();
  const styles = getStyles(c);
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuthStore();
  const [group, setGroup] = useState<Group | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [showMembers, setShowMembers] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [friends, setFriends] = useState<{ id: string; name: string | null; username?: string | null }[]>([]);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());
  const {
    listRef, onScroll, onContentSizeChange, scrollToBottom,
    showDown, typingLabel, notifyTyping, stopTyping,
  } = useChatUx("group", id, { id: user?.id, name: user?.name });

  const myMembership = group?.members.find((m) => m.user.id === user?.id);
  const isAdmin = myMembership?.role === "admin";
  const isMuted = !!myMembership?.muted;

  // Group profile photo (admin): 1:1 crop with native zoom, compressed
  const pickGroupPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t("er.permission"), t("er.photoPerm"));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    try {
      const dataUrl = await compressToDataUrl(result.assets[0].uri, 512, 0.6);
      await api.patch(`/groups/${id}`, { photo: dataUrl });
      setShowSettings(false);
      await load();
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.error ?? "Could not set the group photo");
    }
  };

  const toggleMute = async () => {
    try {
      await api.post(`/groups/${id}/mute`, { muted: !isMuted });
      setShowSettings(false);
      await load();
    } catch { /* noop */ }
  };

  const leaveGroup = () => {
    Alert.alert(t("gr.leaveQ"), `${t("gr.leaveMsg")} "${group?.name}".`, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.leave"), style: "destructive",
        onPress: async () => {
          try {
            await api.post(`/groups/${id}/leave`);
            router.back();
          } catch { /* noop */ }
        },
      },
    ]);
  };

  const deleteGroup = () => {
    Alert.alert(
      t("gr.deleteQ"),
      `"${group?.name}" ${t("gr.deleteMsg")}`,
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"), style: "destructive",
          onPress: async () => {
            try {
              await api.delete(`/groups/${id}`);
              router.back();
            } catch (e: any) {
              Alert.alert("Error", e?.response?.data?.error ?? "Could not delete the group");
            }
          },
        },
      ]
    );
  };

  const load = async () => {
    try {
      const [g, m] = await Promise.all([
        api.get(`/groups/${id}`),
        api.get(`/messages/group/${id}`),
      ]);
      setGroup(g.data);
      setMessages(m.data);
    } catch { /* noop */ }
  };

  useFocusEffect(useCallback(() => {
    load();
    // mark chat as read when opening the group
    api.post(`/groups/${id}/seen`).catch(() => {});
  }, [id]));

  useEffect(() => {
    const socket = getSocket();
    socket.emit("join:group", id);
    const onNew = (msg: Message) => {
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      // I'm looking at the chat right now — stay marked as read
      api.post(`/groups/${id}/seen`).catch(() => {});
    };
    socket.on("message:new", onNew);
    return () => {
      socket.emit("leave:group", id);
      socket.off("message:new", onNew);
    };
  }, [id]);

  const send = async () => {
    const content = text.trim();
    if (!content) return;
    setText("");
    stopTyping();
    try {
      await api.post(`/messages/group/${id}`, { content });
      scrollToBottom();
    } catch { /* noop */ }
  };

  const doShareInvite = () => {
    if (!group) return;
    shareInvite("group", group.name, group.inviteCode);
  };

  // Invite modal: app friends + share link
  const openInvite = async () => {
    setShowInvite(true);
    try {
      const res = await api.get("/friends");
      setFriends(res.data);
    } catch { /* noop */ }
  };

  const inviteFriend = async (friendId: string) => {
    try {
      await api.post(`/groups/${id}/invite`, { memberIds: [friendId] });
      setInvitedIds((prev) => new Set(prev).add(friendId));
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.error ?? "Could not invite");
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
            <Ionicons name="chevron-back" size={18} color={c.teal} />
            <Text style={styles.backText}>{t("common.back")}</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
            <TouchableOpacity onPress={openInvite} style={styles.inviteRow}>
              <Ionicons name="person-add-outline" size={15} color={c.teal} />
              <Text style={styles.inviteText}>{t("common.invite")}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowSettings(true)}>
              <Ionicons name="settings-outline" size={19} color={c.teal} />
            </TouchableOpacity>
          </View>
        </View>
        <TouchableOpacity onPress={() => setShowMembers((v) => !v)}>
          <View style={styles.titleRow}>
            {group?.photo ? (
              <Image source={{ uri: group.photo }} style={styles.groupAvatarImg} />
            ) : (
              <View style={[styles.groupAvatar, { backgroundColor: userColor(id ?? "g") }]}>
                <Text style={styles.groupAvatarText}>{group?.name?.[0]?.toUpperCase() ?? "?"}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={styles.title}>{group?.name ?? "..."}</Text>
                {isMuted && <Ionicons name="notifications-off-outline" size={15} color={c.faint} />}
              </View>
              <Text style={[styles.meta, typingLabel ? { color: c.teal, fontFamily: font.bodySemi } : null]}>
                {typingLabel ?? `${group?.members.length ?? 0} ${showMembers ? t("gr.tapHide") : t("gr.tapSee")}`}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
        {showMembers && (
          <View style={styles.memberList}>
            {group?.members.map((m) => (
              <TouchableOpacity
                key={m.user.id}
                style={styles.memberRow}
                onPress={() => setProfileUserId(m.user.id)}
              >
                <View style={[styles.memberAvatar, { backgroundColor: userColor(m.user.id) }]}>
                  <Text style={styles.memberAvatarText}>{(m.user.name ?? "?")[0]?.toUpperCase()}</Text>
                </View>
                <Text style={styles.memberItem}>{m.user.name ?? "?"}</Text>
                {m.role === "admin" && (
                  <View style={styles.adminChip}>
                    <Text style={styles.adminChipText}>admin</Text>
                  </View>
                )}
                <Ionicons name="chevron-forward" size={14} color={c.faint} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <View style={{ flex: 1 }}>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        style={styles.chat}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 12, paddingTop: 10 }}
        onContentSizeChange={onContentSizeChange}
        onScroll={onScroll}
        scrollEventThrottle={100}
        renderItem={({ item }) => {
          const mine = item.user.id === user?.id;
          const color = userColor(item.user.id);
          return (
            <View style={[styles.msgRow, mine && styles.msgRowMine]}>
              {!mine && (
                <TouchableOpacity onPress={() => setProfileUserId(item.user.id)}>
                  <View style={[styles.msgAvatar, { backgroundColor: color }]}>
                    <Text style={styles.msgAvatarText}>{chatName(item.user)[0]?.toUpperCase()}</Text>
                  </View>
                </TouchableOpacity>
              )}
              <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
                {!mine && (
                  <TouchableOpacity onPress={() => setProfileUserId(item.user.id)}>
                    <Text style={[styles.bubbleName, { color }]}>{chatName(item.user)}</Text>
                  </TouchableOpacity>
                )}
                <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{item.content}</Text>
                <Text style={[styles.bubbleTime, mine && styles.bubbleTimeMine]}>
                  {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.emptyChat}>{t("gr.emptyChat")}</Text>
        }
      />

      {/* Jump to latest message */}
      {showDown && (
        <TouchableOpacity style={styles.downFab} onPress={() => scrollToBottom()}>
          <Ionicons name="chevron-down" size={20} color={c.orange} />
        </TouchableOpacity>
      )}
      </View>

      {/* Someone is typing */}
      {typingLabel && (
        <View style={styles.typingRow}>
          <View style={styles.typingDots}>
            <View style={[styles.typingDot, { opacity: 0.4 }]} />
            <View style={[styles.typingDot, { opacity: 0.7 }]} />
            <View style={styles.typingDot} />
          </View>
          <Text style={styles.typingText}>{typingLabel}</Text>
        </View>
      )}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder={t("chat.placeholder")}
          placeholderTextColor={c.faint}
          value={text}
          onChangeText={(t) => { setText(t); notifyTyping(t); }}
          onSubmitEditing={send}
          returnKeyType="send"
        />
        <TouchableOpacity style={styles.sendBtn} onPress={send}>
          <Ionicons name="send" size={17} color={c.onOrange} />
        </TouchableOpacity>
      </View>

      {/* Tapped-user profile */}
      {/* Invite modal: app friends + share link */}
      <Modal visible={showInvite} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t("gr.inviteTo")} {group?.name ?? ""}</Text>
              <TouchableOpacity onPress={() => setShowInvite(false)}>
                <Ionicons name="close" size={22} color={c.muted} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.shareLinkBtn}
              onPress={() => { setShowInvite(false); doShareInvite(); }}
            >
              <Ionicons name="link-outline" size={16} color={c.onOrange} />
              <Text style={styles.shareLinkText}>{t("gr.shareLink")}</Text>
            </TouchableOpacity>

            <Text style={styles.inviteSectionTitle}>{t("gr.yourFriends")}</Text>
            <ScrollView style={{ maxHeight: 340 }}>
              {(() => {
                const notInGroup = friends.filter(
                  (f) => !group?.members.some((m) => m.user.id === f.id)
                );
                if (friends.length === 0) {
                  return <Text style={styles.inviteHint}>{t("gr.noFriendsHint")}</Text>;
                }
                if (notInGroup.length === 0) {
                  return <Text style={styles.inviteHint}>{t("gr.allIn")}</Text>;
                }
                return notInGroup.map((f) => (
                  <View key={f.id} style={styles.inviteFriendRow}>
                    <View style={[styles.memberAvatar, { backgroundColor: userColor(f.id) }]}>
                      <Text style={styles.memberAvatarText}>{(f.name ?? "?")[0]?.toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.inviteFriendName}>{f.name ?? "?"}</Text>
                      {f.username && <Text style={styles.inviteFriendMeta}>@{f.username}</Text>}
                    </View>
                    {invitedIds.has(f.id) ? (
                      <View style={styles.invitedTagRow}>
                        <Ionicons name="checkmark" size={13} color={c.teal} />
                        <Text style={styles.invitedTag}>{t("gr.invited")}</Text>
                      </View>
                    ) : (
                      <TouchableOpacity style={styles.inviteBtn} onPress={() => inviteFriend(f.id)}>
                        <Text style={styles.inviteBtnText}>{t("common.invite")}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ));
              })()}
            </ScrollView>
            <Text style={styles.inviteHint}>{t("gr.notifJoin")}</Text>
          </View>
        </View>
      </Modal>

      <UserProfileSheet userId={profileUserId} onClose={() => setProfileUserId(null)} />

      {/* Settings modal */}
      <Modal visible={showSettings} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t("scr.groupSettings")}</Text>
              <TouchableOpacity onPress={() => setShowSettings(false)}>
                <Ionicons name="close" size={22} color={c.muted} />
              </TouchableOpacity>
            </View>

            {isAdmin && (
              <TouchableOpacity style={styles.settingRow} onPress={pickGroupPhoto}>
                <View style={styles.settingIconWrap}>
                  <Ionicons name="image-outline" size={18} color={c.teal} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingText}>
                    {group?.photo ? t("gr.photoChange") : t("gr.photoAdd")}
                  </Text>
                  <Text style={styles.settingDesc}>{t("gr.photoDesc")}</Text>
                </View>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.settingRow} onPress={toggleMute}>
              <View style={styles.settingIconWrap}>
                <Ionicons name={isMuted ? "notifications-outline" : "notifications-off-outline"} size={18} color={c.teal} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingText}>{isMuted ? t("gr.unmute") : t("gr.mute")}</Text>
                <Text style={styles.settingDesc}>
                  {isMuted ? t("gr.unmuteDesc") : t("gr.muteDesc")}
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.settingRow} onPress={() => { setShowSettings(false); leaveGroup(); }}>
              <View style={styles.settingIconWrap}>
                <Ionicons name="exit-outline" size={18} color={c.teal} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingText}>{t("group.leave")}</Text>
                <Text style={styles.settingDesc}>{t("gr.leaveDesc")}</Text>
              </View>
            </TouchableOpacity>

            {isAdmin && (
              <TouchableOpacity style={styles.settingRow} onPress={() => { setShowSettings(false); deleteGroup(); }}>
                <View style={[styles.settingIconWrap, { backgroundColor: c.dangerSoft }]}>
                  <Ionicons name="trash-outline" size={18} color={c.danger} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settingText, { color: c.danger }]}>{t("group.delete")}</Text>
                  <Text style={styles.settingDesc}>{t("gr.deleteDesc")}</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const getStyles = themedStyles((c: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  header: {
    padding: 20, paddingTop: 60, borderBottomWidth: 1, borderBottomColor: c.line,
    backgroundColor: c.surface,
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  backText: { color: c.teal, fontSize: 15, fontFamily: font.bodySemi },
  inviteRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  inviteText: { color: c.teal, fontSize: 14.5, fontFamily: font.bodySemi },
  shareLinkBtn: {
    flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 7,
    backgroundColor: c.orange, borderRadius: radius.md, padding: 13,
    marginBottom: 14, ...shadow.orange,
  },
  shareLinkText: { color: c.onOrange, fontSize: 14, fontFamily: font.semi },
  inviteSectionTitle: {
    color: c.muted, fontSize: 11, fontFamily: font.semi, letterSpacing: 1,
    textTransform: "uppercase", marginBottom: 8,
  },
  inviteFriendRow: {
    flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: c.surface,
    borderRadius: radius.md, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: c.line,
  },
  inviteFriendName: { color: c.ink, fontSize: 14.5, fontFamily: font.bodySemi },
  inviteFriendMeta: { color: c.muted, fontSize: 12, fontFamily: font.body },
  invitedTagRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  invitedTag: { color: c.teal, fontSize: 12.5, fontFamily: font.semi },
  inviteHint: { color: c.faint, fontSize: 12.5, fontFamily: font.body, textAlign: "center", paddingVertical: 10 },
  inviteBtn: {
    backgroundColor: c.tealSoft, borderRadius: radius.sm,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  inviteBtnText: { color: c.teal, fontSize: 12.5, fontFamily: font.semi },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  groupAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  groupAvatarImg: { width: 42, height: 42, borderRadius: 21 },
  groupAvatarText: { color: "#fff", fontFamily: font.title, fontSize: 16 },
  title: { fontSize: 19, fontFamily: font.semi, color: c.ink, letterSpacing: -0.3 },
  meta: { color: c.muted, fontSize: 12, fontFamily: font.bodyMedium, marginTop: 2 },
  memberList: {
    marginTop: 12, backgroundColor: c.surface2, borderRadius: radius.md,
    padding: 10, borderWidth: 1, borderColor: c.line,
  },
  memberRow: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 4 },
  memberAvatar: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  memberAvatarText: { color: "#fff", fontFamily: font.semi, fontSize: 11 },
  memberItem: { color: c.ink, fontSize: 13.5, fontFamily: font.bodyMedium, flex: 1 },
  adminChip: {
    backgroundColor: c.tealSoft, borderRadius: radius.pill,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  adminChipText: { color: c.teal, fontSize: 10.5, fontFamily: font.semi },
  chat: { flex: 1, paddingHorizontal: 12 },
  msgRow: { flexDirection: "row", alignItems: "flex-end", gap: 7, marginBottom: 8, maxWidth: "84%" },
  msgRowMine: { alignSelf: "flex-end", flexDirection: "row-reverse" },
  msgAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  msgAvatarText: { color: "#fff", fontFamily: font.semi, fontSize: 11 },
  bubble: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 9, flexShrink: 1 },
  bubbleMine: { backgroundColor: c.orange, borderBottomRightRadius: 5 },
  bubbleOther: {
    backgroundColor: c.surface, borderBottomLeftRadius: 5,
    borderWidth: 1, borderColor: c.line,
  },
  bubbleName: { fontSize: 11.5, fontFamily: font.semi, marginBottom: 2 },
  bubbleText: { color: c.ink, fontSize: 14.5, fontFamily: font.bodyMedium, lineHeight: 21 },
  bubbleTextMine: { color: c.onOrange },
  bubbleTime: { color: c.faint, fontSize: 10, fontFamily: font.body, marginTop: 3, alignSelf: "flex-end" },
  bubbleTimeMine: { color: "rgba(255,255,255,0.75)" },
  emptyChat: { color: c.faint, textAlign: "center", marginTop: 32, fontSize: 13.5, fontFamily: font.body },
  downFab: {
    position: "absolute", right: 14, bottom: 12, width: 38, height: 38, borderRadius: 19,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.line,
    alignItems: "center", justifyContent: "center", ...shadow.card,
  },
  typingRow: {
    flexDirection: "row", alignItems: "center", gap: 7,
    paddingHorizontal: 16, paddingVertical: 5, backgroundColor: c.bg,
  },
  typingDots: { flexDirection: "row", gap: 3 },
  typingDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: c.teal },
  typingText: { color: c.teal, fontSize: 12, fontFamily: font.bodyMedium, fontStyle: "italic" },
  inputRow: {
    flexDirection: "row", padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: c.line,
    backgroundColor: c.surface,
  },
  input: {
    flex: 1, backgroundColor: c.surface2, borderRadius: radius.pill, paddingHorizontal: 16,
    paddingVertical: 12, color: c.ink, fontSize: 14.5, fontFamily: font.bodyMedium,
    borderWidth: 1, borderColor: c.line,
  },
  sendBtn: {
    backgroundColor: c.orange, borderRadius: 24, width: 46, height: 46,
    alignItems: "center", justifyContent: "center", ...shadow.orange,
  },
  modalOverlay: { flex: 1, backgroundColor: "rgba(7,32,48,0.55)", justifyContent: "flex-end" },
  modal: {
    backgroundColor: c.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 40,
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { color: c.ink, fontSize: 19, fontFamily: font.title },
  settingRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: c.surface,
    borderRadius: radius.lg, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: c.line,
  },
  settingIconWrap: {
    width: 36, height: 36, borderRadius: 11, backgroundColor: c.tealSoft,
    alignItems: "center", justifyContent: "center", marginRight: 12,
  },
  settingText: { color: c.ink, fontSize: 15, fontFamily: font.semi },
  settingDesc: { color: c.muted, fontSize: 12.5, fontFamily: font.body, marginTop: 2 },
}));
