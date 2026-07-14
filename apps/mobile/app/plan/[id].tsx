import { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList,
  KeyboardAvoidingView, Platform, ScrollView, Modal, Alert,
} from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../lib/api";
import { getSocket } from "../../lib/socket";
import { useAuthStore } from "../../hooks/useAuthStore";
import ExpensesModule from "../../components/plan/ExpensesModule";
import ChecklistModule from "../../components/plan/ChecklistModule";
import ActivitiesModule from "../../components/plan/ActivitiesModule";
import VotesModule from "../../components/plan/VotesModule";
import GalleryModule from "../../components/plan/GalleryModule";
import PlaylistModule from "../../components/plan/PlaylistModule";
import MeetupModule from "../../components/plan/MeetupModule";
import FilesModule from "../../components/plan/FilesModule";
import AvailabilityHeatmap from "../../components/plan/AvailabilityHeatmap";
import WalkieTalkieModule from "../../components/plan/WalkieTalkieModule";
import { shareInvite } from "../../lib/invite";
import { useChatUx } from "../../hooks/useChatUx";
import { colors, font, radius, shadow, userColor } from "../../lib/theme";

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
  moduleActivity: Record<string, string>;
  members: {
    rsvp: string; role: string;
    moduleSeen?: Record<string, string>;
    user: { id: string; name: string | null };
  }[];
  modules: { id: string; type: string }[];
  messages: Message[];
};

type ModIcon = keyof typeof Ionicons.glyphMap;

const MODULE_CATALOG: { type: string; icon: ModIcon; name: string; desc: string }[] = [
  { type: "expenses", icon: "card-outline", name: "Split Expenses", desc: "Track costs, split the bill" },
  { type: "checklist", icon: "checkbox-outline", name: "Packing List", desc: "Shared checklist, assign items" },
  { type: "activities", icon: "list-outline", name: "Activities", desc: "Order and schedule what to do" },
  { type: "votes", icon: "stats-chart-outline", name: "Quick Vote", desc: "Decide things together" },
  { type: "walkietalkie", icon: "mic-outline", name: "Walkie Talkie", desc: "Push-to-talk voice" },
  { type: "gallery", icon: "images-outline", name: "Gallery", desc: "Shared photo album" },
  { type: "playlist", icon: "musical-notes-outline", name: "Playlist", desc: "Spotify & YouTube Music" },
  { type: "files", icon: "document-attach-outline", name: "Files & Notes", desc: "Maps, PDFs, shared notes" },
  { type: "meetup", icon: "location-outline", name: "Meetup Tracker", desc: "Who's on the way" },
];

export default function PlanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuthStore();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  // null = module grid (home of the plan); a string = that module is open
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [showAddModule, setShowAddModule] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDates, setShowDates] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const askAi = async () => {
    const q = aiQuestion.trim();
    if (!q) return;
    setAiLoading(true);
    setAiAnswer("");
    try {
      const res = await api.post(`/ai/assistant/${id}`, { question: q }, { timeout: 40000 });
      setAiAnswer(res.data.answer);
    } catch (e: any) {
      setAiAnswer(e?.response?.data?.error ?? "AI request failed");
    } finally {
      setAiLoading(false);
    }
  };
  const [friends, setFriends] = useState<{ id: string; name: string | null }[]>([]);
  const {
    listRef, onScroll, onContentSizeChange, scrollToBottom,
    showDown, typingLabel, notifyTyping, stopTyping,
  } = useChatUx("plan", id, { id: user?.id, name: user?.name });

  const myMembership = plan?.members.find((m) => m.user.id === user?.id);
  const myRole = myMembership?.role ?? "member";
  const canManage = myRole === "admin" || myRole === "helper";
  const isAdmin = myRole === "admin";

  // Local copy of what I've seen, so dots clear instantly when switching tabs
  const [seenLocal, setSeenLocal] = useState<Record<string, string>>({});
  const mySeen = { ...(myMembership?.moduleSeen ?? {}), ...seenLocal };

  const isUnseen = (module: string): boolean => {
    if (module === activeTab) return false;
    const at = plan?.moduleActivity?.[module];
    if (!at) return false;
    const seenAt = mySeen[module];
    return !seenAt || new Date(at) > new Date(seenAt);
  };

  // Mark the open module as seen whenever it changes (or activity arrives on it)
  useEffect(() => {
    if (!plan || !activeTab) return;
    const now = new Date().toISOString();
    setSeenLocal((prev) => ({ ...prev, [activeTab]: now }));
    api.post(`/plans/${id}/seen`, { module: activeTab }).catch(() => {});
  }, [activeTab, activeTab ? plan?.moduleActivity?.[activeTab] : null]);

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
      Alert.alert("Template saved", `"${res.data.name}" — you'll see it when creating a new plan.`);
    } catch {
      Alert.alert("Error", "Could not save the template");
    }
  };

  const leavePlan = () => {
    Alert.alert("Leave plan?", `You will leave "${plan?.title}".`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave", style: "destructive",
        onPress: async () => {
          try {
            await api.post(`/plans/${id}/leave`);
            router.back();
          } catch (e: any) {
            Alert.alert("Error", e?.response?.data?.error ?? "Could not leave the plan");
          }
        },
      },
    ]);
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

    // Bump local module activity so tab dots light up live
    const bump = (module: string) => () => {
      setPlan((prev) =>
        prev
          ? { ...prev, moduleActivity: { ...prev.moduleActivity, [module]: new Date().toISOString() } }
          : prev
      );
    };
    const listeners: [string, () => void][] = [
      ["message:new", bump("chat")],
      ["expense:added", bump("expenses")],
      ["expense:removed", bump("expenses")],
      ["checklist:changed", bump("checklist")],
      ["activities:changed", bump("activities")],
      ["votes:changed", bump("votes")],
      ["gallery:changed", bump("gallery")],
      ["playlist:changed", bump("playlist")],
      ["files:changed", bump("files")],
      ["notes:changed", bump("files")],
    ];
    listeners.forEach(([ev, fn]) => socket.on(ev, fn));

    return () => {
      socket.emit("leave:plan", id);
      socket.off("message:new", onNew);
      listeners.forEach(([ev, fn]) => socket.off(ev, fn));
    };
  }, [id]);

  const send = async () => {
    const content = text.trim();
    if (!content) return;
    setText("");
    stopTyping();
    try {
      await api.post(`/messages/plan/${id}`, { content });
      scrollToBottom();
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
              setActiveTab(null);
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
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
            <Ionicons name="chevron-back" size={18} color={colors.teal} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
            <TouchableOpacity onPress={() => setShowAi(true)}>
              <Ionicons name="sparkles-outline" size={19} color={colors.teal} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowDates(true)}>
              <Ionicons name="calendar-outline" size={19} color={colors.teal} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { loadFriends(); setShowMembers(true); }}
              style={styles.membersBtn}
            >
              <Ionicons name="people-outline" size={17} color={colors.teal} />
              <Text style={styles.membersBtnText}>{plan?.members.length ?? 0}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowSettings(true)}>
              <Ionicons name="settings-outline" size={19} color={colors.teal} />
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.title} numberOfLines={1}>{plan?.title ?? "..."}</Text>
        <View style={styles.metaRow}>
          {plan?.location && (
            <View style={styles.metaItem}>
              <Ionicons name="location-outline" size={13} color={colors.muted} />
              <Text style={styles.meta}>{plan.location}</Text>
            </View>
          )}
          <Text style={[styles.meta, { color: colors.teal, fontFamily: font.semi }]}>
            {yesCount}/{plan?.members.length ?? 0} in
          </Text>
          {myRole !== "member" && (
            <View style={styles.roleChip}>
              <Text style={styles.roleChipText}>{myRole === "admin" ? "Admin" : "Helper"}</Text>
            </View>
          )}
        </View>
      </View>

      {/* RSVP — only on the module grid */}
      {activeTab === null && (
        <View style={styles.rsvpRow}>
          {([
            { v: "yes", label: "I'm in", icon: "checkmark-circle-outline" as ModIcon, color: colors.teal },
            { v: "maybe", label: "Maybe", icon: "help-circle-outline" as ModIcon, color: "#F0A72B" },
            { v: "no", label: "Can't", icon: "close-circle-outline" as ModIcon, color: colors.danger },
          ]).map(({ v, label, icon, color }) => {
            const active = myRsvp === v;
            return (
              <TouchableOpacity
                key={v}
                style={[styles.rsvpBtn, active && { borderColor: color, backgroundColor: `${color}18` }]}
                onPress={() => rsvp(v)}
              >
                <Ionicons name={icon} size={15} color={active ? color : colors.muted} />
                <Text style={[styles.rsvpText, active && { color: colors.ink }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Back-to-modules bar when a module is open */}
      {activeTab !== null && (
        <View style={styles.moduleBar}>
          <TouchableOpacity onPress={() => setActiveTab(null)} style={styles.moduleBarBack}>
            <Ionicons name="chevron-back" size={16} color={colors.teal} />
            <Ionicons name="grid-outline" size={14} color={colors.teal} />
            <Text style={styles.moduleBarBackText}>Modules</Text>
          </TouchableOpacity>
          <Text style={styles.moduleBarTitle}>
            {activeTab === "chat" ? "Chat" : MODULE_CATALOG.find((c) => c.type === activeTab)?.name ?? ""}
          </Text>
          <View style={{ width: 92 }} />
        </View>
      )}

      {/* Content */}
      {activeTab === null ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.gridWrap}>
          <Text style={styles.gridLabel}>Modules</Text>
          <View style={styles.grid}>
            {/* Chat is always first */}
            <TouchableOpacity style={styles.gridCard} onPress={() => setActiveTab("chat")}>
              {isUnseen("chat") && <View style={styles.gridDot} />}
              <View style={[styles.gridIcon, { backgroundColor: colors.orange }]}>
                <Ionicons name="chatbubble-outline" size={17} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.gridName}>Chat</Text>
                <Text style={[styles.gridSub, isUnseen("chat") && styles.gridSubNew]} numberOfLines={1}>
                  {isUnseen("chat") ? "New messages" : "Group chat"}
                </Text>
              </View>
            </TouchableOpacity>

            {enabledModules.map((m, i) => {
              const info = MODULE_CATALOG.find((c) => c.type === m.type);
              const accent = [colors.teal, colors.petrol, colors.orange][i % 3];
              const unseen = isUnseen(m.type);
              return (
                <TouchableOpacity
                  key={m.type}
                  style={styles.gridCard}
                  onPress={() => setActiveTab(m.type)}
                  onLongPress={canManage ? () => removeModule(m.type) : undefined}
                >
                  {unseen && <View style={styles.gridDot} />}
                  <View style={[styles.gridIcon, { backgroundColor: accent }]}>
                    <Ionicons name={info?.icon ?? "cube-outline"} size={17} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.gridName} numberOfLines={1}>{info?.name}</Text>
                    <Text style={[styles.gridSub, unseen && styles.gridSubNew]} numberOfLines={1}>
                      {unseen ? "New activity" : info?.desc}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            {canManage && (
              <TouchableOpacity style={[styles.gridCard, styles.gridAddCard]} onPress={() => setShowAddModule(true)}>
                <View style={[styles.gridIcon, { backgroundColor: colors.orangeSoft }]}>
                  <Ionicons name="add" size={19} color={colors.orange} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.gridName, { color: colors.orange }]}>Add module</Text>
                  <Text style={styles.gridSub} numberOfLines={1}>Expand this plan</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
          {canManage && enabledModules.length > 0 && (
            <Text style={styles.gridHint}>Long-press a module to remove it</Text>
          )}
          <View style={{ height: 30 }} />
        </ScrollView>
      ) : activeTab === "chat" ? (
        <>
          <View style={{ flex: 1 }}>
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            style={styles.chat}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 12 }}
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
              <Text style={styles.emptyChat}>No messages yet — say something!</Text>
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
        </>
      ) : activeTab === "expenses" && plan ? (
        <ExpensesModule planId={plan.id} members={plan.members} myRole={myRole} />
      ) : activeTab === "checklist" && plan ? (
        <ChecklistModule planId={plan.id} members={plan.members} myRole={myRole} />
      ) : activeTab === "activities" && plan ? (
        <ActivitiesModule planId={plan.id} myRole={myRole} />
      ) : activeTab === "votes" && plan ? (
        <VotesModule planId={plan.id} myRole={myRole} />
      ) : activeTab === "gallery" && plan ? (
        <GalleryModule planId={plan.id} myRole={myRole} />
      ) : activeTab === "playlist" && plan ? (
        <PlaylistModule planId={plan.id} myRole={myRole} />
      ) : activeTab === "meetup" && plan ? (
        <MeetupModule planId={plan.id} />
      ) : activeTab === "files" && plan ? (
        <FilesModule planId={plan.id} myRole={myRole} />
      ) : activeTab === "walkietalkie" && plan ? (
        <WalkieTalkieModule planId={plan.id} members={plan.members} />
      ) : (
        <View style={styles.modulePlaceholder}>
          <View style={styles.modulePlaceholderIcon}>
            <Ionicons
              name={MODULE_CATALOG.find((m) => m.type === activeTab)?.icon ?? "cube-outline"}
              size={36}
              color={colors.teal}
            />
          </View>
          <Text style={styles.modulePlaceholderTitle}>
            {MODULE_CATALOG.find((m) => m.type === activeTab)?.name}
          </Text>
          <Text style={styles.modulePlaceholderText}>Coming soon</Text>
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
                <Ionicons name="close" size={22} color={colors.muted} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.shareBtn}
              onPress={() => plan && shareInvite("plan", plan.title, plan.inviteCode)}
            >
              <Ionicons name="link-outline" size={16} color={colors.onOrange} />
              <Text style={styles.shareBtnText}>Share invite link</Text>
            </TouchableOpacity>
            <ScrollView>
              {plan?.members.map((m) => {
                const isMe = m.user.id === user?.id;
                const rsvpIcon: ModIcon =
                  m.rsvp === "yes" ? "checkmark-circle"
                  : m.rsvp === "no" ? "close-circle"
                  : m.rsvp === "maybe" ? "help-circle"
                  : "time-outline";
                const rsvpColor =
                  m.rsvp === "yes" ? colors.teal
                  : m.rsvp === "no" ? colors.danger
                  : m.rsvp === "maybe" ? "#F0A72B"
                  : colors.faint;
                return (
                  <View key={m.user.id} style={styles.memberRow}>
                    <View style={[styles.memberAvatar, { backgroundColor: userColor(m.user.id) }]}>
                      <Text style={styles.memberAvatarText}>{(m.user.name ?? "?")[0]?.toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.memberName}>
                        {isMe ? "You" : m.user.name ?? "?"}
                      </Text>
                      {m.role !== "member" && (
                        <Text style={styles.memberRole}>{m.role === "admin" ? "Admin" : "Helper"}</Text>
                      )}
                    </View>
                    <Ionicons name={rsvpIcon} size={18} color={rsvpColor} style={{ marginRight: 8 }} />
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
                        <View style={[styles.memberAvatar, { backgroundColor: userColor(f.id) }]}>
                          <Text style={styles.memberAvatarText}>{(f.name ?? "?")[0]?.toUpperCase()}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.memberName}>{f.name ?? "?"}</Text>
                        </View>
                        {invitedIds.has(f.id) ? (
                          <View style={styles.invitedTagRow}>
                            <Ionicons name="checkmark" size={13} color={colors.teal} />
                            <Text style={styles.invitedTag}>Invited</Text>
                          </View>
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

      {/* AI assistant modal */}
      <Modal visible={showAi} animationType="slide" transparent>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { maxHeight: "85%" }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                <Ionicons name="sparkles" size={17} color={colors.orange} />
                <Text style={styles.modalTitle}>Plan Assistant</Text>
              </View>
              <TouchableOpacity onPress={() => setShowAi(false)}>
                <Ionicons name="close" size={22} color={colors.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 320 }} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled">
              {aiAnswer ? (
                <View style={styles.aiAnswerBox}>
                  <Text style={styles.aiAnswerText}>{aiAnswer}</Text>
                </View>
              ) : (
                <Text style={styles.aiHint}>
                  Ask anything about this plan:{"\n\n"}
                  "What should we pack?"{"\n"}
                  "Suggest a schedule for the day"{"\n"}
                  "How should we split the budget?"{"\n"}
                  "¿Qué comida conviene para 6 personas?"
                </Text>
              )}
            </ScrollView>

            <View style={styles.aiInputRow}>
              <TextInput
                style={styles.aiInput}
                placeholder="Ask the assistant..."
                placeholderTextColor={colors.faint}
                value={aiQuestion}
                onChangeText={setAiQuestion}
                onSubmitEditing={askAi}
                returnKeyType="send"
              />
              <TouchableOpacity
                style={[styles.aiSendBtn, (aiLoading || !aiQuestion.trim()) && { opacity: 0.5 }]}
                onPress={askAi}
                disabled={aiLoading || !aiQuestion.trim()}
              >
                {aiLoading
                  ? <Text style={styles.aiSendText}>...</Text>
                  : <Ionicons name="send" size={16} color={colors.onOrange} />}
              </TouchableOpacity>
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Group availability heatmap modal */}
      <Modal visible={showDates} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { maxHeight: "88%" }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Group availability</Text>
              <TouchableOpacity onPress={() => setShowDates(false)}>
                <Ionicons name="close" size={22} color={colors.muted} />
              </TouchableOpacity>
            </View>
            {plan && <AvailabilityHeatmap planId={plan.id} />}
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
                <Ionicons name="close" size={22} color={colors.muted} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.settingRow} onPress={saveTemplate}>
              <View style={styles.settingIconWrap}>
                <Ionicons name="documents-outline" size={18} color={colors.teal} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingText}>Save as template</Text>
                <Text style={styles.settingDesc}>
                  Reuse this plan's modules, checklist and activities next time
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.settingRow} onPress={() => { setShowSettings(false); leavePlan(); }}>
              <View style={styles.settingIconWrap}>
                <Ionicons name="exit-outline" size={18} color={colors.teal} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingText}>Leave plan</Text>
                <Text style={styles.settingDesc}>You can rejoin later with an invite</Text>
              </View>
            </TouchableOpacity>

            {isAdmin && (
              <TouchableOpacity style={styles.settingRow} onPress={() => { setShowSettings(false); deletePlan(); }}>
                <View style={[styles.settingIconWrap, { backgroundColor: colors.dangerSoft }]}>
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settingText, { color: colors.danger }]}>Delete plan</Text>
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
                <Ionicons name="close" size={22} color={colors.muted} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {availableModules.length === 0 ? (
                <Text style={styles.emptyChat}>All modules added!</Text>
              ) : (
                availableModules.map((m) => (
                  <TouchableOpacity key={m.type} style={styles.moduleRow} onPress={() => addModule(m.type)}>
                    <View style={styles.moduleIconWrap}>
                      <Ionicons name={m.icon} size={19} color={colors.teal} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.moduleName}>{m.name}</Text>
                      <Text style={styles.moduleDesc}>{m.desc}</Text>
                    </View>
                    <Ionicons name="add-circle-outline" size={22} color={colors.orange} />
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
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    padding: 20, paddingTop: 60, paddingBottom: 12,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  headerTopRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  backText: { color: colors.teal, fontSize: 15, fontFamily: font.bodySemi },
  membersBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  membersBtnText: { color: colors.teal, fontSize: 13.5, fontFamily: font.semi },
  title: { fontSize: 20, fontFamily: font.title, color: colors.ink, letterSpacing: -0.3 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 5, flexWrap: "wrap" },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  meta: { color: colors.muted, fontSize: 12.5, fontFamily: font.bodyMedium },
  roleChip: {
    backgroundColor: colors.orangeSoft, borderRadius: radius.pill,
    paddingHorizontal: 9, paddingVertical: 2,
  },
  roleChipText: { color: colors.orange, fontSize: 11, fontFamily: font.semi },
  rsvpRow: { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  rsvpBtn: {
    flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 5,
    backgroundColor: colors.surface, borderRadius: radius.md, padding: 10,
    borderWidth: 1.5, borderColor: colors.line,
  },
  rsvpText: { color: colors.muted, fontSize: 12.5, fontFamily: font.semi },
  moduleBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.surface,
  },
  moduleBarBack: { flexDirection: "row", alignItems: "center", gap: 4, width: 92 },
  moduleBarBackText: { color: colors.teal, fontSize: 13.5, fontFamily: font.bodySemi },
  moduleBarTitle: { color: colors.ink, fontSize: 15, fontFamily: font.semi, letterSpacing: -0.2 },
  gridWrap: { padding: 14, paddingTop: 4 },
  gridLabel: {
    fontSize: 11, fontFamily: font.semi, letterSpacing: 1, textTransform: "uppercase",
    color: colors.muted, marginBottom: 10, marginLeft: 4,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  gridCard: {
    width: "48.5%", flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: 13,
    marginBottom: 10, borderWidth: 1, borderColor: colors.line, ...shadow.card,
  },
  gridAddCard: { borderStyle: "dashed", borderColor: colors.orange, shadowOpacity: 0, elevation: 0 },
  gridIcon: {
    width: 36, height: 36, borderRadius: 11,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  gridName: { color: colors.ink, fontSize: 13, fontFamily: font.semi, letterSpacing: -0.1 },
  gridSub: { color: colors.muted, fontSize: 10.5, fontFamily: font.bodyMedium, marginTop: 1 },
  gridSubNew: { color: colors.orange, fontFamily: font.bodySemi },
  gridDot: {
    position: "absolute", top: 8, right: 8, width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.orange, zIndex: 1,
  },
  gridHint: { color: colors.faint, fontSize: 11.5, fontFamily: font.body, textAlign: "center", marginTop: 6 },
  chat: { flex: 1, paddingHorizontal: 12, paddingTop: 8 },
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
  modulePlaceholder: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  modulePlaceholderIcon: {
    width: 80, height: 80, borderRadius: 24, backgroundColor: colors.tealSoft,
    alignItems: "center", justifyContent: "center",
  },
  modulePlaceholderTitle: { color: colors.ink, fontSize: 20, fontFamily: font.title, marginTop: 12 },
  modulePlaceholderText: { color: colors.muted, fontSize: 14, fontFamily: font.bodyMedium, marginTop: 8 },
  modulePlaceholderHint: { color: colors.faint, fontSize: 12, fontFamily: font.body, marginTop: 24 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(7,32,48,0.55)", justifyContent: "flex-end" },
  modal: {
    backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, maxHeight: "75%",
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { color: colors.ink, fontSize: 19, fontFamily: font.title },
  moduleRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.surface,
    borderRadius: radius.lg, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.line,
  },
  moduleIconWrap: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: colors.tealSoft,
    alignItems: "center", justifyContent: "center", marginRight: 12,
  },
  moduleName: { color: colors.ink, fontSize: 15, fontFamily: font.semi },
  moduleDesc: { color: colors.muted, fontSize: 12.5, fontFamily: font.body, marginTop: 2 },
  memberRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.surface,
    borderRadius: radius.md, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.line,
  },
  memberAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", marginRight: 11 },
  memberAvatarText: { color: "#fff", fontFamily: font.semi, fontSize: 14 },
  memberName: { color: colors.ink, fontSize: 14.5, fontFamily: font.bodySemi },
  memberRole: { color: colors.teal, fontSize: 11.5, fontFamily: font.semi, marginTop: 1 },
  roleBtn: {
    backgroundColor: colors.tealSoft, borderRadius: radius.sm,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  roleBtnText: { color: colors.teal, fontSize: 12, fontFamily: font.semi },
  aiAnswerBox: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16,
    borderWidth: 1, borderColor: colors.line,
  },
  aiAnswerText: { color: colors.ink, fontSize: 14, fontFamily: font.bodyMedium, lineHeight: 22 },
  aiHint: { color: colors.muted, fontSize: 13.5, fontFamily: font.body, lineHeight: 22, padding: 8 },
  aiInputRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  aiInput: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: 14,
    color: colors.ink, fontSize: 14.5, fontFamily: font.bodyMedium,
    borderWidth: 1, borderColor: colors.line,
  },
  aiSendBtn: {
    backgroundColor: colors.orange, borderRadius: radius.md, width: 50,
    alignItems: "center", justifyContent: "center", ...shadow.orange,
  },
  aiSendText: { color: colors.onOrange, fontSize: 17, fontFamily: font.semi },
  shareBtn: {
    flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 7,
    backgroundColor: colors.orange, borderRadius: radius.md, padding: 13,
    marginBottom: 12, ...shadow.orange,
  },
  shareBtnText: { color: colors.onOrange, fontSize: 14, fontFamily: font.semi },
  inviteSectionTitle: {
    color: colors.muted, fontSize: 11, fontFamily: font.semi, letterSpacing: 1,
    textTransform: "uppercase", marginTop: 16, marginBottom: 8,
  },
  invitedTagRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  invitedTag: { color: colors.teal, fontSize: 12.5, fontFamily: font.semi },
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
