import { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList,
  KeyboardAvoidingView, Platform, Modal, Alert,
} from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../lib/api";
import { getSocket } from "../../lib/socket";
import { useAuthStore } from "../../hooks/useAuthStore";
import { shareInvite } from "../../lib/invite";
import { useChatUx } from "../../hooks/useChatUx";
import { colors, font, radius, shadow, userColor } from "../../lib/theme";

type Message = {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; name: string | null };
};

type Group = {
  id: string;
  name: string;
  description: string | null;
  inviteCode: string;
  members: { role: string; muted?: boolean; user: { id: string; name: string | null } }[];
};

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuthStore();
  const [group, setGroup] = useState<Group | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [showMembers, setShowMembers] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const {
    listRef, onScroll, onContentSizeChange, scrollToBottom,
    showDown, typingLabel, notifyTyping, stopTyping,
  } = useChatUx("group", id, { id: user?.id, name: user?.name });

  const myMembership = group?.members.find((m) => m.user.id === user?.id);
  const isAdmin = myMembership?.role === "admin";
  const isMuted = !!myMembership?.muted;

  const toggleMute = async () => {
    try {
      await api.post(`/groups/${id}/mute`, { muted: !isMuted });
      setShowSettings(false);
      await load();
    } catch { /* noop */ }
  };

  const leaveGroup = () => {
    Alert.alert("Leave group?", `You will leave "${group?.name}".`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave", style: "destructive",
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
      "Delete group?",
      `"${group?.name}" and its chat will be deleted for everyone. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete", style: "destructive",
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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
            <Ionicons name="chevron-back" size={18} color={colors.teal} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
            <TouchableOpacity onPress={doShareInvite} style={styles.inviteRow}>
              <Ionicons name="person-add-outline" size={15} color={colors.teal} />
              <Text style={styles.inviteText}>Invite</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowSettings(true)}>
              <Ionicons name="settings-outline" size={19} color={colors.teal} />
            </TouchableOpacity>
          </View>
        </View>
        <TouchableOpacity onPress={() => setShowMembers((v) => !v)}>
          <View style={styles.titleRow}>
            <View style={[styles.groupAvatar, { backgroundColor: userColor(id ?? "g") }]}>
              <Text style={styles.groupAvatarText}>{group?.name?.[0]?.toUpperCase() ?? "?"}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={styles.title}>{group?.name ?? "..."}</Text>
                {isMuted && <Ionicons name="notifications-off-outline" size={15} color={colors.faint} />}
              </View>
              <Text style={[styles.meta, typingLabel ? { color: colors.teal, fontFamily: font.bodySemi } : null]}>
                {typingLabel ?? `${group?.members.length ?? 0} members — tap to ${showMembers ? "hide" : "see"}`}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
        {showMembers && (
          <View style={styles.memberList}>
            {group?.members.map((m) => (
              <View key={m.user.id} style={styles.memberRow}>
                <View style={[styles.memberAvatar, { backgroundColor: userColor(m.user.id) }]}>
                  <Text style={styles.memberAvatarText}>{(m.user.name ?? "?")[0]?.toUpperCase()}</Text>
                </View>
                <Text style={styles.memberItem}>{m.user.name ?? "?"}</Text>
                {m.role === "admin" && (
                  <View style={styles.adminChip}>
                    <Text style={styles.adminChipText}>admin</Text>
                  </View>
                )}
              </View>
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
                <View style={[styles.msgAvatar, { backgroundColor: color }]}>
                  <Text style={styles.msgAvatarText}>{(item.user.name ?? "?")[0]?.toUpperCase()}</Text>
                </View>
              )}
              <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
                {!mine && <Text style={[styles.bubbleName, { color }]}>{item.user.name ?? "?"}</Text>}
                <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{item.content}</Text>
                <Text style={[styles.bubbleTime, mine && styles.bubbleTimeMine]}>
                  {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.emptyChat}>No messages yet — say hi!</Text>
        }
      />

      {/* Jump to latest message */}
      {showDown && (
        <TouchableOpacity style={styles.downFab} onPress={() => scrollToBottom()}>
          <Ionicons name="chevron-down" size={20} color={colors.orange} />
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
          placeholder="Message..."
          placeholderTextColor={colors.faint}
          value={text}
          onChangeText={(t) => { setText(t); notifyTyping(t); }}
          onSubmitEditing={send}
          returnKeyType="send"
        />
        <TouchableOpacity style={styles.sendBtn} onPress={send}>
          <Ionicons name="send" size={17} color={colors.onOrange} />
        </TouchableOpacity>
      </View>

      {/* Settings modal */}
      <Modal visible={showSettings} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Group settings</Text>
              <TouchableOpacity onPress={() => setShowSettings(false)}>
                <Ionicons name="close" size={22} color={colors.muted} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.settingRow} onPress={toggleMute}>
              <View style={styles.settingIconWrap}>
                <Ionicons name={isMuted ? "notifications-outline" : "notifications-off-outline"} size={18} color={colors.teal} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingText}>{isMuted ? "Unmute" : "Mute"}</Text>
                <Text style={styles.settingDesc}>
                  {isMuted ? "Get notifications from this group again" : "Stop notifications from this group"}
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.settingRow} onPress={() => { setShowSettings(false); leaveGroup(); }}>
              <View style={styles.settingIconWrap}>
                <Ionicons name="exit-outline" size={18} color={colors.teal} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingText}>Leave group</Text>
                <Text style={styles.settingDesc}>You can rejoin later with an invite</Text>
              </View>
            </TouchableOpacity>

            {isAdmin && (
              <TouchableOpacity style={styles.settingRow} onPress={() => { setShowSettings(false); deleteGroup(); }}>
                <View style={[styles.settingIconWrap, { backgroundColor: colors.dangerSoft }]}>
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settingText, { color: colors.danger }]}>Delete group</Text>
                  <Text style={styles.settingDesc}>Deletes the group and chat for everyone</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    padding: 20, paddingTop: 60, borderBottomWidth: 1, borderBottomColor: colors.line,
    backgroundColor: colors.surface,
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  backText: { color: colors.teal, fontSize: 15, fontFamily: font.bodySemi },
  inviteRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  inviteText: { color: colors.teal, fontSize: 14.5, fontFamily: font.bodySemi },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  groupAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  groupAvatarText: { color: "#fff", fontFamily: font.title, fontSize: 16 },
  title: { fontSize: 19, fontFamily: font.semi, color: colors.ink, letterSpacing: -0.3 },
  meta: { color: colors.muted, fontSize: 12, fontFamily: font.bodyMedium, marginTop: 2 },
  memberList: {
    marginTop: 12, backgroundColor: colors.surface2, borderRadius: radius.md,
    padding: 10, borderWidth: 1, borderColor: colors.line,
  },
  memberRow: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 4 },
  memberAvatar: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  memberAvatarText: { color: "#fff", fontFamily: font.semi, fontSize: 11 },
  memberItem: { color: colors.ink, fontSize: 13.5, fontFamily: font.bodyMedium, flex: 1 },
  adminChip: {
    backgroundColor: colors.tealSoft, borderRadius: radius.pill,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  adminChipText: { color: colors.teal, fontSize: 10.5, fontFamily: font.semi },
  chat: { flex: 1, paddingHorizontal: 12 },
  msgRow: { flexDirection: "row", alignItems: "flex-end", gap: 7, marginBottom: 8, maxWidth: "84%" },
  msgRowMine: { alignSelf: "flex-end", flexDirection: "row-reverse" },
  msgAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  msgAvatarText: { color: "#fff", fontFamily: font.semi, fontSize: 11 },
  bubble: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 9, flexShrink: 1 },
  bubbleMine: { backgroundColor: colors.orange, borderBottomRightRadius: 5 },
  bubbleOther: {
    backgroundColor: colors.surface, borderBottomLeftRadius: 5,
    borderWidth: 1, borderColor: colors.line,
  },
  bubbleName: { fontSize: 11.5, fontFamily: font.semi, marginBottom: 2 },
  bubbleText: { color: colors.ink, fontSize: 14.5, fontFamily: font.bodyMedium, lineHeight: 21 },
  bubbleTextMine: { color: colors.onOrange },
  bubbleTime: { color: colors.faint, fontSize: 10, fontFamily: font.body, marginTop: 3, alignSelf: "flex-end" },
  bubbleTimeMine: { color: "rgba(255,255,255,0.75)" },
  emptyChat: { color: colors.faint, textAlign: "center", marginTop: 32, fontSize: 13.5, fontFamily: font.body },
  downFab: {
    position: "absolute", right: 14, bottom: 12, width: 38, height: 38, borderRadius: 19,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
    alignItems: "center", justifyContent: "center", ...shadow.card,
  },
  typingRow: {
    flexDirection: "row", alignItems: "center", gap: 7,
    paddingHorizontal: 16, paddingVertical: 5, backgroundColor: colors.bg,
  },
  typingDots: { flexDirection: "row", gap: 3 },
  typingDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.teal },
  typingText: { color: colors.teal, fontSize: 12, fontFamily: font.bodyMedium, fontStyle: "italic" },
  inputRow: {
    flexDirection: "row", padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: colors.line,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1, backgroundColor: colors.surface2, borderRadius: radius.pill, paddingHorizontal: 16,
    paddingVertical: 12, color: colors.ink, fontSize: 14.5, fontFamily: font.bodyMedium,
    borderWidth: 1, borderColor: colors.line,
  },
  sendBtn: {
    backgroundColor: colors.orange, borderRadius: 24, width: 46, height: 46,
    alignItems: "center", justifyContent: "center", ...shadow.orange,
  },
  modalOverlay: { flex: 1, backgroundColor: "rgba(7,32,48,0.55)", justifyContent: "flex-end" },
  modal: {
    backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 40,
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { color: colors.ink, fontSize: 19, fontFamily: font.title },
  settingRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.surface,
    borderRadius: radius.lg, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.line,
  },
  settingIconWrap: {
    width: 36, height: 36, borderRadius: 11, backgroundColor: colors.tealSoft,
    alignItems: "center", justifyContent: "center", marginRight: 12,
  },
  settingText: { color: colors.ink, fontSize: 15, fontFamily: font.semi },
  settingDesc: { color: colors.muted, fontSize: 12.5, fontFamily: font.body, marginTop: 2 },
});
