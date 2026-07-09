import { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList,
  KeyboardAvoidingView, Platform, ScrollView, Modal, Alert, Share,
} from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { api } from "../../lib/api";
import { getSocket } from "../../lib/socket";
import { useAuthStore } from "../../hooks/useAuthStore";
import ExpensesModule from "../../components/plan/ExpensesModule";
import ChecklistModule from "../../components/plan/ChecklistModule";
import ActivitiesModule from "../../components/plan/ActivitiesModule";
import VotesModule from "../../components/plan/VotesModule";

type Message = {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; name: string | null };
};

type Plan = {
  id: string;
  title: string;
  type: string;
  location: string | null;
  startDate: string | null;
  inviteCode: string;
  members: { rsvp: string; role: string; user: { id: string; name: string | null } }[];
  modules: { id: string; type: string }[];
  messages: Message[];
};

const MODULE_CATALOG: { type: string; emoji: string; name: string; desc: string }[] = [
  { type: "expenses", emoji: "💸", name: "Split Expenses", desc: "Track costs, split the bill" },
  { type: "checklist", emoji: "🛒", name: "Packing List", desc: "Shared checklist, assign items" },
  { type: "activities", emoji: "📋", name: "Activities", desc: "Order and schedule what to do" },
  { type: "votes", emoji: "🗳️", name: "Quick Vote", desc: "Decide things together" },
  { type: "walkietalkie", emoji: "🎙️", name: "Walkie Talkie", desc: "Push-to-talk voice" },
  { type: "gallery", emoji: "📸", name: "Gallery", desc: "Shared photo album" },
  { type: "playlist", emoji: "🎵", name: "Playlist", desc: "Spotify & YouTube Music" },
  { type: "files", emoji: "📎", name: "Files & Notes", desc: "Maps, PDFs, shared notes" },
  { type: "meetup", emoji: "📍", name: "Meetup Tracker", desc: "Who's on the way" },
];

export default function PlanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuthStore();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [activeTab, setActiveTab] = useState<string>("chat");
  const [showAddModule, setShowAddModule] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [friends, setFriends] = useState<{ id: string; name: string | null }[]>([]);
  const listRef = useRef<FlatList>(null);

  const myMembership = plan?.members.find((m) => m.user.id === user?.id);
  const myRole = myMembership?.role ?? "member";
  const canManage = myRole === "admin" || myRole === "helper";
  const isAdmin = myRole === "admin";

  const setRole = async (targetUserId: string, role: "helper" | "member") => {
    try {
      await api.post(`/plans/${id}/members/${targetUserId}/role`, { role });
      await load();
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.error ?? "Could not change role");
    }
  };

  const loadFriends = async () => {
    try {
      const res = await api.get("/friends");
      setFriends(res.data);
    } catch { /* noop */ }
  };

  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());
  const inviteFriend = async (friendId: string) => {
    try {
      await api.post(`/plans/${id}/invite`, { memberIds: [friendId] });
      setInvitedIds((prev) => new Set(prev).add(friendId));
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.error ?? "Could not invite");
    }
  };

  const saveTemplate = async () => {
    try {
      const res = await api.post(`/plans/${id}/save-template`, {});
      setShowSettings(false);
      Alert.alert("✅ Template saved", `"${res.data.name}" — you'll see it when creating a new plan.`);
    } catch {
      Alert.alert("Error", "Could not save the template");
    }
  };

  const deletePlan = () => {
    Alert.alert(
      "Delete plan?",
      `"${plan?.title}" and everything in it (chat, expenses, lists) will be deleted for everyone. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete", style: "destructive",
          onPress: async () => {
            try {
              await api.delete(`/plans/${id}`);
              router.back();
            } catch (e: any) {
              Alert.alert("Error", e?.response?.data?.error ?? "Could not delete the plan");
            }
          },
        },
      ]
    );
  };

  const load = async () => {
    try {
      const res = await api.get(`/plans/${id}`);
      setPlan(res.data);
      setMessages(res.data.messages ?? []);
    } catch { /* noop */ }
  };

  useFocusEffect(useCallback(() => { load(); }, [id]));

  useEffect(() => {
    const socket = getSocket();
    socket.emit("join:plan", id);
    const onNew = (msg: Message) => {
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    };
    socket.on("message:new", onNew);
    return () => {
      socket.emit("leave:plan", id);
      socket.off("message:new", onNew);
    };
  }, [id]);

  const send = async () => {
    const content = text.trim();
    if (!content) return;
    setText("");
    try {
      await api.post(`/messages/plan/${id}`, { content });
    } catch { /* noop */ }
  };

  const rsvp = async (value: string) => {
    try {
      await api.post(`/plans/${id}/rsvp`, { rsvp: value });
      await load();
    } catch { /* noop */ }
  };

  const addModule = async (type: string) => {
    try {
      await api.post(`/plans/${id}/modules`, { type });
      setShowAddModule(false);
      await load();
      setActiveTab(type);
    } catch {
      Alert.alert("Error", "Could not add the module");
    }
  };

  const removeModule = (type: string) => {
    const mod = MODULE_CATALOG.find((m) => m.type === type);
    Alert.alert(
      `Remove ${mod?.name}?`,
      "The module and its tab will be removed from this plan.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove", style: "destructive",
          onPress: async () => {
            try {
              await api.delete(`/plans/${id}/modules/${type}`);
              setActiveTab("chat");
              await load();
            } catch { /* noop */ }
          },
        },
      ]
    );
  };

  const myRsvp = plan?.members.find((m) => m.user.id === user?.id)?.rsvp;
  const yesCount = plan?.members.filter((m) => m.rsvp === "yes").length ?? 0;
  const enabledModules = plan?.modules ?? [];
  const availableModules = MODULE_CATALOG.filter(
    (m) => !enabledModules.some((e) => e.type === m.type)
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>‹ Back</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: "row", gap: 20 }}>
            <TouchableOpacity onPress={() => { loadFriends(); setShowMembers(true); }}>
              <Text style={styles.backText}>👥 {plan?.members.length ?? 0}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowSettings(true)}>
              <Text style={styles.backText}>⚙️</Text>
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.title} numberOfLines={1}>{plan?.title ?? "..."}</Text>
        <Text style={styles.meta}>
          {plan?.location ? `📍 ${plan.location}  ` : ""}✅ {yesCount} in
          {myRole !== "member" ? `  ·  ${myRole === "admin" ? "👑 Admin" : "🛠️ Helper"}` : ""}
        </Text>
      </View>

      {/* RSVP */}
      <View style={styles.rsvpRow}>
        {[
          { v: "yes", label: "✅ I'm in" },
          { v: "maybe", label: "🤔 Maybe" },
          { v: "no", label: "❌ Can't" },
        ].map(({ v, label }) => (
          <TouchableOpacity
            key={v}
            style={[styles.rsvpBtn, myRsvp === v && styles.rsvpBtnActive]}
            onPress={() => rsvp(v)}
          >
            <Text style={[styles.rsvpText, myRsvp === v && styles.rsvpTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Module tabs */}
      <View style={styles.tabBarWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tab, activeTab === "chat" && styles.tabActive]}
            onPress={() => setActiveTab("chat")}
          >
            <Text style={styles.tabText}>💬 Chat</Text>
          </TouchableOpacity>
          {enabledModules.map((m) => {
            const info = MODULE_CATALOG.find((c) => c.type === m.type);
            return (
              <TouchableOpacity
                key={m.type}
                style={[styles.tab, activeTab === m.type && styles.tabActive]}
                onPress={() => setActiveTab(m.type)}
                onLongPress={canManage ? () => removeModule(m.type) : undefined}
              >
                <Text style={styles.tabText}>{info?.emoji} {info?.name}</Text>
              </TouchableOpacity>
            );
          })}
          {canManage && (
            <TouchableOpacity style={styles.tabAdd} onPress={() => setShowAddModule(true)}>
              <Text style={styles.tabAddText}>＋</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      {/* Content */}
      {activeTab === "chat" ? (
        <>
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
              <Text style={styles.emptyChat}>No messages yet — say something! 💬</Text>
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
        </>
      ) : activeTab === "expenses" && plan ? (
        <ExpensesModule planId={plan.id} members={plan.members} myRole={myRole} />
      ) : activeTab === "checklist" && plan ? (
        <ChecklistModule planId={plan.id} members={plan.members} myRole={myRole} />
      ) : activeTab === "activities" && plan ? (
        <ActivitiesModule planId={plan.id} myRole={myRole} />
      ) : activeTab === "votes" && plan ? (
        <VotesModule planId={plan.id} myRole={myRole} />
      ) : (
        <View style={styles.modulePlaceholder}>
          <Text style={styles.modulePlaceholderEmoji}>
            {MODULE_CATALOG.find((m) => m.type === activeTab)?.emoji}
          </Text>
          <Text style={styles.modulePlaceholderTitle}>
            {MODULE_CATALOG.find((m) => m.type === activeTab)?.name}
          </Text>
          <Text style={styles.modulePlaceholderText}>Coming in Phase 3 🚧</Text>
          <Text style={styles.modulePlaceholderHint}>Long-press the tab to remove this module</Text>
        </View>
      )}

      {/* Members & roles modal */}
      <Modal visible={showMembers} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Members</Text>
              <TouchableOpacity onPress={() => setShowMembers(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.shareBtn}
              onPress={() => {
                if (!plan) return;
                Share.share({
                  message: `Join my plan "${plan.title}" on PlanIt! Invite code: ${plan.inviteCode}`,
                });
              }}
            >
              <Text style={styles.shareBtnText}>🔗 Share invite code</Text>
            </TouchableOpacity>
            <ScrollView>
              {plan?.members.map((m) => {
                const isMe = m.user.id === user?.id;
                const roleLabel = m.role === "admin" ? "👑 Admin" : m.role === "helper" ? "🛠️ Helper" : "";
                const rsvpEmoji = m.rsvp === "yes" ? "✅" : m.rsvp === "no" ? "❌" : m.rsvp === "maybe" ? "🤔" : "⏳";
                return (
                  <View key={m.user.id} style={styles.memberRow}>
                    <Text style={styles.memberRsvp}>{rsvpEmoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.memberName}>
                        {isMe ? "You" : m.user.name ?? "?"}
                      </Text>
                      {roleLabel !== "" && <Text style={styles.memberRole}>{roleLabel}</Text>}
                    </View>
                    {isAdmin && !isMe && m.role !== "admin" && (
                      <TouchableOpacity
                        style={styles.roleBtn}
                        onPress={() => setRole(m.user.id, m.role === "helper" ? "member" : "helper")}
                      >
                        <Text style={styles.roleBtnText}>
                          {m.role === "helper" ? "Remove helper" : "Make helper"}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}

              {/* Invite friends who aren't in the plan yet */}
              {(() => {
                const notInPlan = friends.filter(
                  (f) => !plan?.members.some((m) => m.user.id === f.id)
                );
                if (notInPlan.length === 0) return null;
                return (
                  <>
                    <Text style={styles.inviteSectionTitle}>Invite friends</Text>
                    {notInPlan.map((f) => (
                      <View key={f.id} style={styles.memberRow}>
                        <Text style={styles.memberRsvp}>🤝</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.memberName}>{f.name ?? "?"}</Text>
                        </View>
                        {invitedIds.has(f.id) ? (
                          <Text style={styles.invitedTag}>Invited ✓</Text>
                        ) : (
                          <TouchableOpacity style={styles.roleBtn} onPress={() => inviteFriend(f.id)}>
                            <Text style={styles.roleBtnText}>Invite</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ))}
                  </>
                );
              })()}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Plan settings modal */}
      <Modal visible={showSettings} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Plan settings</Text>
              <TouchableOpacity onPress={() => setShowSettings(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.settingRow} onPress={saveTemplate}>
              <Text style={styles.settingIcon}>📑</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingText}>Save as template</Text>
                <Text style={styles.settingDesc}>
                  Reuse this plan's modules, checklist and activities next time
                </Text>
              </View>
            </TouchableOpacity>

            {isAdmin && (
              <TouchableOpacity style={styles.settingRow} onPress={() => { setShowSettings(false); deletePlan(); }}>
                <Text style={styles.settingIcon}>🗑️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settingText, { color: "#ef4444" }]}>Delete plan</Text>
                  <Text style={styles.settingDesc}>Deletes everything for everyone — cannot be undone</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* Add module modal */}
      <Modal visible={showAddModule} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add a module</Text>
              <TouchableOpacity onPress={() => setShowAddModule(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView>
              {availableModules.length === 0 ? (
                <Text style={styles.emptyChat}>All modules added! 🎉</Text>
              ) : (
                availableModules.map((m) => (
                  <TouchableOpacity key={m.type} style={styles.moduleRow} onPress={() => addModule(m.type)}>
                    <Text style={styles.moduleEmoji}>{m.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.moduleName}>{m.name}</Text>
                      <Text style={styles.moduleDesc}>{m.desc}</Text>
                    </View>
                    <Text style={styles.moduleAdd}>＋</Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  header: { padding: 20, paddingTop: 60, paddingBottom: 10 },
  backText: { color: "#6366f1", fontSize: 17, marginBottom: 8 },
  title: { fontSize: 22, fontWeight: "800", color: "#ffffff" },
  meta: { color: "#94a3b8", fontSize: 14, marginTop: 4 },
  rsvpRow: { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingBottom: 8 },
  rsvpBtn: { flex: 1, backgroundColor: "#1e293b", borderRadius: 12, padding: 10, alignItems: "center", borderWidth: 2, borderColor: "transparent" },
  rsvpBtnActive: { borderColor: "#6366f1" },
  rsvpText: { color: "#94a3b8", fontSize: 13, fontWeight: "600" },
  rsvpTextActive: { color: "#ffffff" },
  tabBarWrap: { borderBottomWidth: 1, borderBottomColor: "#1e293b" },
  tabBar: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  tab: { backgroundColor: "#1e293b", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 2, borderColor: "transparent" },
  tabActive: { borderColor: "#6366f1", backgroundColor: "#312e81" },
  tabText: { color: "#e2e8f0", fontSize: 13, fontWeight: "600" },
  tabAdd: { backgroundColor: "#6366f1", borderRadius: 20, width: 36, alignItems: "center", justifyContent: "center" },
  tabAddText: { color: "#ffffff", fontSize: 18, fontWeight: "700" },
  chat: { flex: 1, paddingHorizontal: 12, paddingTop: 8 },
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
  modulePlaceholder: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  modulePlaceholderEmoji: { fontSize: 56 },
  modulePlaceholderTitle: { color: "#ffffff", fontSize: 22, fontWeight: "800", marginTop: 12 },
  modulePlaceholderText: { color: "#64748b", fontSize: 15, marginTop: 8 },
  modulePlaceholderHint: { color: "#475569", fontSize: 12, marginTop: 24 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modal: { backgroundColor: "#0f172a", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "75%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { color: "#ffffff", fontSize: 20, fontWeight: "800" },
  modalClose: { color: "#64748b", fontSize: 20 },
  moduleRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#1e293b", borderRadius: 16, padding: 16, marginBottom: 10 },
  moduleEmoji: { fontSize: 26, marginRight: 14 },
  moduleName: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  moduleDesc: { color: "#64748b", fontSize: 13, marginTop: 2 },
  moduleAdd: { color: "#6366f1", fontSize: 24, fontWeight: "700" },
  memberRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#1e293b", borderRadius: 14, padding: 14, marginBottom: 8 },
  memberRsvp: { fontSize: 18, marginRight: 12 },
  memberName: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
  memberRole: { color: "#818cf8", fontSize: 12, marginTop: 2 },
  roleBtn: { backgroundColor: "#312e81", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  roleBtnText: { color: "#c7d2fe", fontSize: 12, fontWeight: "700" },
  shareBtn: { backgroundColor: "#312e81", borderRadius: 14, padding: 14, alignItems: "center", marginBottom: 12 },
  shareBtnText: { color: "#c7d2fe", fontSize: 15, fontWeight: "700" },
  inviteSectionTitle: { color: "#94a3b8", fontSize: 14, fontWeight: "700", marginTop: 16, marginBottom: 8 },
  invitedTag: { color: "#22c55e", fontSize: 13, fontWeight: "700" },
  settingRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#1e293b", borderRadius: 16, padding: 16, marginBottom: 10 },
  settingIcon: { fontSize: 24, marginRight: 14 },
  settingText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  settingDesc: { color: "#64748b", fontSize: 13, marginTop: 2 },
});
