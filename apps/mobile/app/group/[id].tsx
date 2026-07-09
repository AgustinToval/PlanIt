import { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList,
  KeyboardAvoidingView, Platform, Share, Modal, Alert,
} from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { api } from "../../lib/api";
import { getSocket } from "../../lib/socket";
import { useAuthStore } from "../../hooks/useAuthStore";

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
  const listRef = useRef<FlatList>(null);

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

  useFocusEffect(useCallback(() => { load(); }, [id]));

  useEffect(() => {
    const socket = getSocket();
    socket.emit("join:group", id);
    const onNew = (msg: Message) => {
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
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
    try {
      await api.post(`/messages/group/${id}`, { content });
    } catch { /* noop */ }
  };

  const shareInvite = () => {
    if (!group) return;
    Share.share({
      message: `Join my group "${group.name}" on PlanIt! Use invite code: ${group.inviteCode}`,
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>‹ Back</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: "row", gap: 20 }}>
            <TouchableOpacity onPress={shareInvite}>
              <Text style={styles.inviteText}>+ Invite</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowSettings(true)}>
              <Text style={styles.inviteText}>⚙️</Text>
            </TouchableOpacity>
          </View>
        </View>
        <TouchableOpacity onPress={() => setShowMembers((v) => !v)}>
          <Text style={styles.title}>{group?.name ?? "..."} {isMuted ? "🔕" : ""}</Text>
          <Text style={styles.meta}>
            👥 {group?.members.length ?? 0} members — tap to {showMembers ? "hide" : "see"}
          </Text>
        </TouchableOpacity>
        {showMembers && (
          <View style={styles.memberList}>
            {group?.members.map((m) => (
              <Text key={m.user.id} style={styles.memberItem}>
                {m.user.name ?? "?"} {m.role === "admin" ? "· 👑" : ""}
              </Text>
            ))}
          </View>
        )}
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        style={styles.chat}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 12 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => {
          const mine = item.user.id === user?.id;
          return (
            <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
              {!mine && <Text style={styles.bubbleName}>{item.user.name ?? "?"}</Text>}
              <Text style={styles.bubbleText}>{item.content}</Text>
              <Text style={styles.bubbleTime}>
                {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </Text>
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.emptyChat}>No messages yet — say hi! 👋</Text>
        }
      />

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Message..."
          placeholderTextColor="#475569"
          value={text}
          onChangeText={setText}
          onSubmitEditing={send}
          returnKeyType="send"
        />
        <TouchableOpacity style={styles.sendBtn} onPress={send}>
          <Text style={styles.sendText}>➤</Text>
        </TouchableOpacity>
      </View>

      {/* Settings modal */}
      <Modal visible={showSettings} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Group settings</Text>
              <TouchableOpacity onPress={() => setShowSettings(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.settingRow} onPress={toggleMute}>
              <Text style={styles.settingIcon}>{isMuted ? "🔔" : "🔕"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingText}>{isMuted ? "Unmute" : "Mute"}</Text>
                <Text style={styles.settingDesc}>
                  {isMuted ? "Get notifications from this group again" : "Stop notifications from this group"}
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.settingRow} onPress={() => { setShowSettings(false); leaveGroup(); }}>
              <Text style={styles.settingIcon}>🚪</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingText}>Leave group</Text>
                <Text style={styles.settingDesc}>You can rejoin later with an invite</Text>
              </View>
            </TouchableOpacity>

            {isAdmin && (
              <TouchableOpacity style={styles.settingRow} onPress={() => { setShowSettings(false); deleteGroup(); }}>
                <Text style={styles.settingIcon}>🗑️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settingText, { color: "#ef4444" }]}>Delete group</Text>
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
  container: { flex: 1, backgroundColor: "#0f172a" },
  header: { padding: 20, paddingTop: 60, borderBottomWidth: 1, borderBottomColor: "#1e293b" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  backText: { color: "#6366f1", fontSize: 17 },
  inviteText: { color: "#6366f1", fontSize: 16, fontWeight: "600" },
  title: { fontSize: 22, fontWeight: "800", color: "#ffffff" },
  meta: { color: "#94a3b8", fontSize: 13, marginTop: 4 },
  memberList: { marginTop: 12, backgroundColor: "#1e293b", borderRadius: 12, padding: 12 },
  memberItem: { color: "#cbd5e1", fontSize: 14, paddingVertical: 3 },
  chat: { flex: 1, paddingHorizontal: 12 },
  bubble: { borderRadius: 16, padding: 12, marginBottom: 8, maxWidth: "80%" },
  bubbleMine: { backgroundColor: "#4f46e5", alignSelf: "flex-end" },
  bubbleOther: { backgroundColor: "#1e293b", alignSelf: "flex-start" },
  bubbleName: { color: "#818cf8", fontSize: 12, fontWeight: "700", marginBottom: 2 },
  bubbleText: { color: "#ffffff", fontSize: 15 },
  bubbleTime: { color: "#94a3b8", fontSize: 10, marginTop: 4, alignSelf: "flex-end" },
  emptyChat: { color: "#475569", textAlign: "center", marginTop: 32, fontSize: 14 },
  inputRow: { flexDirection: "row", padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: "#1e293b" },
  input: { flex: 1, backgroundColor: "#1e293b", borderRadius: 14, padding: 14, color: "#ffffff", fontSize: 15 },
  sendBtn: { backgroundColor: "#6366f1", borderRadius: 14, width: 50, alignItems: "center", justifyContent: "center" },
  sendText: { color: "#ffffff", fontSize: 18 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modal: { backgroundColor: "#0f172a", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { color: "#ffffff", fontSize: 20, fontWeight: "800" },
  modalClose: { color: "#64748b", fontSize: 20 },
  settingRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#1e293b", borderRadius: 16, padding: 16, marginBottom: 10 },
  settingIcon: { fontSize: 24, marginRight: 14 },
  settingText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  settingDesc: { color: "#64748b", fontSize: 13, marginTop: 2 },
});
