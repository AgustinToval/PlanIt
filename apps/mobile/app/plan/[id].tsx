import { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList,
  KeyboardAvoidingView, Platform, ScrollView, Modal, Alert, RefreshControl,
} from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { api } from "../../lib/api";
import { compressToDataUrl } from "../../lib/images";
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
import RaffleModule from "../../components/plan/RaffleModule";
import { shareInvite } from "../../lib/invite";
import { useChatUx } from "../../hooks/useChatUx";
import UserProfileSheet from "../../components/UserProfileSheet";
import { font, radius, shadow, userColor, Palette, themedStyles } from "../../lib/theme";
import { useTheme, useT } from "../../hooks/useSettings";
import type { TKey } from "../../lib/i18n";

type Message = {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; name: string | null; username?: string | null };
};

// Chat shows the username (without the #tag); falls back to the display name
const chatName = (u: Message["user"]) => u.username ?? u.name ?? "?";

type Plan = {
  id: string;
  title: string;
  type: string;
  description?: string | null;
  bannerImage?: string | null;
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
  { type: "expenses", icon: "card-outline", name: "cat.expenses.n", desc: "cat.expenses.d" },
  { type: "checklist", icon: "checkbox-outline", name: "cat.checklist.n", desc: "cat.checklist.d" },
  { type: "activities", icon: "list-outline", name: "cat.activities.n", desc: "cat.activities.d" },
  { type: "votes", icon: "stats-chart-outline", name: "cat.votes.n", desc: "cat.votes.d" },
  { type: "walkietalkie", icon: "mic-outline", name: "cat.walkietalkie.n", desc: "cat.walkietalkie.d" },
  { type: "gallery", icon: "images-outline", name: "cat.gallery.n", desc: "cat.gallery.d" },
  { type: "playlist", icon: "musical-notes-outline", name: "cat.playlist.n", desc: "cat.playlist.d" },
  { type: "files", icon: "document-attach-outline", name: "cat.files.n", desc: "cat.files.d" },
  { type: "meetup", icon: "location-outline", name: "cat.meetup.n", desc: "cat.meetup.d" },
  { type: "raffle", icon: "disc-outline", name: "cat.raffle.n", desc: "cat.raffle.d" },
];

export default function PlanScreen() {
  const c = useTheme();
  const styles = getStyles(c);
  const t = useT();
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
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
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

  // ---- Banner photo (admin/helper) ----
  const pickBanner = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t("er.permission"), t("er.photoPerm"));
      return;
    }
    // 16:9 crop with native zoom/preview, then compressed to ~100-200 KB
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    try {
      const dataUrl = await compressToDataUrl(result.assets[0].uri, 1200, 0.6);
      await api.patch(`/plans/${id}`, { bannerImage: dataUrl });
      setShowSettings(false);
      await load();
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.error ?? "Could not set the banner");
    }
  };

  const bannerAction = () => {
    if (!plan?.bannerImage) {
      pickBanner();
      return;
    }
    Alert.alert(t("pl.bannerQ"), t("plans.whatDo"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("pl.bannerChangePhoto"), onPress: pickBanner },
      {
        text: t("pl.bannerRemove"), style: "destructive",
        onPress: async () => {
          try {
            await api.patch(`/plans/${id}`, { bannerImage: null });
            setShowSettings(false);
            await load();
          } catch { /* noop */ }
        },
      },
    ]);
  };

  // ---- Edit plan (admin/helper) ----
  const [showEdit, setShowEdit] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editDate, setEditDate] = useState(""); // DD/MM
  const [editTime, setEditTime] = useState(""); // HH:MM
  const [editDesc, setEditDesc] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const openEdit = () => {
    if (!plan) return;
    setEditTitle(plan.title);
    setEditLocation(plan.location ?? "");
    setEditDesc(plan.description ?? "");
    if (plan.startDate) {
      const d = new Date(plan.startDate);
      setEditDate(`${d.getDate()}/${d.getMonth() + 1}`);
      setEditTime(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
    } else {
      setEditDate("");
      setEditTime("");
    }
    setShowSettings(false);
    setShowEdit(true);
  };

  const saveEdit = async () => {
    if (!editTitle.trim()) return;
    setSavingEdit(true);
    try {
      let startDate: string | undefined;
      const dm = editDate.trim().match(/^(\d{1,2})\/(\d{1,2})$/); // DD/MM
      if (dm) {
        const day = dm[1]!.padStart(2, "0");
        const month = dm[2]!.padStart(2, "0");
        const now = new Date();
        let year = now.getFullYear();
        const candidate = new Date(`${year}-${month}-${day}T23:59:59`);
        if (candidate.getTime() < now.getTime()) year += 1;
        const hhmm = /^\d{1,2}:\d{2}$/.test(editTime.trim()) ? editTime.trim().padStart(5, "0") : "00:00";
        startDate = `${year}-${month}-${day}T${hhmm}:00`;
      }
      await api.patch(`/plans/${id}`, {
        title: editTitle.trim(),
        description: editDesc.trim() || undefined,
        location: editLocation.trim() || undefined,
        ...(startDate ? { startDate } : {}),
      });
      setShowEdit(false);
      await load();
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.error ?? "Could not update the plan");
    } finally {
      setSavingEdit(false);
    }
  };

  const saveTemplate = async () => {
    try {
      const res = await api.post(`/plans/${id}/save-template`, {});
      setShowSettings(false);
      Alert.alert(t("pl.tplSaved"), `"${res.data.name}" — you'll see it when creating a new plan.`);
    } catch {
      Alert.alert("Error", "Could not save the template");
    }
  };

  const leavePlan = () => {
    Alert.alert(t("plans.leaveTitle"), `${t("plans.leaveMsg")} "${plan?.title}".`, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.leave"), style: "destructive",
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
      t("plans.deleteTitle"),
      `"${plan?.title}" ${t("plans.deleteMsg")}`,
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"), style: "destructive",
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

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
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
      ["raffle:changed", bump("raffle")],
      ["raffle:spun", bump("raffle")],
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
      `${t("pl.removeQ")} ${mod ? t(mod.name as TKey) : ""}?`,
      t("pl.removeMsg"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.remove"), style: "destructive",
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
            <Ionicons name="chevron-back" size={18} color={c.teal} />
            <Text style={styles.backText}>{t("common.back")}</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
            <TouchableOpacity onPress={() => setShowAi(true)}>
              <Ionicons name="sparkles-outline" size={19} color={c.teal} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowDates(true)}>
              <Ionicons name="calendar-outline" size={19} color={c.teal} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { loadFriends(); setShowMembers(true); }}
              style={styles.membersBtn}
            >
              <Ionicons name="people-outline" size={17} color={c.teal} />
              <Text style={styles.membersBtnText}>{plan?.members.length ?? 0}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowSettings(true)}>
              <Ionicons name="settings-outline" size={19} color={c.teal} />
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.title} numberOfLines={1}>{plan?.title ?? "..."}</Text>
        <View style={styles.metaRow}>
          {plan?.location && (
            <View style={styles.metaItem}>
              <Ionicons name="location-outline" size={13} color={c.muted} />
              <Text style={styles.meta}>{plan.location}</Text>
            </View>
          )}
          <Text style={[styles.meta, { color: c.teal, fontFamily: font.semi }]}>
            {yesCount}/{plan?.members.length ?? 0} {t("plans.in")}
          </Text>
          {myRole !== "member" && (
            <View style={styles.roleChip}>
              <Text style={styles.roleChipText}>{myRole === "admin" ? t("pl.admin") : t("pl.helper")}</Text>
            </View>
          )}
        </View>
      </View>

      {/* RSVP — only on the module grid */}
      {activeTab === null && (
        <View style={styles.rsvpRow}>
          {([
            { v: "yes", label: t("pl.imIn"), icon: "checkmark-circle-outline" as ModIcon, color: c.teal },
            { v: "maybe", label: t("pl.maybe"), icon: "help-circle-outline" as ModIcon, color: "#F0A72B" },
            { v: "no", label: t("pl.cant"), icon: "close-circle-outline" as ModIcon, color: c.danger },
          ]).map(({ v, label, icon, color }) => {
            const active = myRsvp === v;
            return (
              <TouchableOpacity
                key={v}
                style={[styles.rsvpBtn, active && { borderColor: color, backgroundColor: `${color}18` }]}
                onPress={() => rsvp(v)}
              >
                <Ionicons name={icon} size={15} color={active ? color : c.muted} />
                <Text style={[styles.rsvpText, active && { color: c.ink }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Back-to-modules bar when a module is open */}
      {activeTab !== null && (
        <View style={styles.moduleBar}>
          <TouchableOpacity onPress={() => setActiveTab(null)} style={styles.moduleBarBack}>
            <Ionicons name="chevron-back" size={16} color={c.teal} />
            <Ionicons name="grid-outline" size={14} color={c.teal} />
            <Text style={styles.moduleBarBackText}>{t("pl.modules")}</Text>
          </TouchableOpacity>
          <Text style={styles.moduleBarTitle}>
            {t((activeTab === "chat" ? "pl.chat" : MODULE_CATALOG.find((x) => x.type === activeTab)?.name ?? "pl.chat") as TKey)}
          </Text>
          <View style={{ width: 92 }} />
        </View>
      )}

      {/* Content */}
      {activeTab === null ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.gridWrap}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.orange} />}
        >
          <Text style={styles.gridLabel}>{t("pl.modules")}</Text>
          <View style={styles.grid}>
            {/* Chat is always first */}
            <TouchableOpacity style={styles.gridCard} onPress={() => setActiveTab("chat")}>
              {isUnseen("chat") && <View style={styles.gridDot} />}
              <View style={[styles.gridIcon, { backgroundColor: c.orange }]}>
                <Ionicons name="chatbubble-outline" size={17} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.gridName}>{t("pl.chat")}</Text>
                <Text style={[styles.gridSub, isUnseen("chat") && styles.gridSubNew]} numberOfLines={1}>
                  {isUnseen("chat") ? t("pl.newMsgs") : t("pl.groupChat")}
                </Text>
              </View>
            </TouchableOpacity>

            {enabledModules.map((m, i) => {
              const info = MODULE_CATALOG.find((c) => c.type === m.type);
              const accent = [c.teal, c.petrol, c.orange][i % 3];
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
                    <Text style={styles.gridName} numberOfLines={1}>{info ? t(info.name as TKey) : ""}</Text>
                    <Text style={[styles.gridSub, unseen && styles.gridSubNew]} numberOfLines={1}>
                      {unseen ? t("pl.newActivity") : info ? t(info.desc as TKey) : ""}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            {canManage && (
              <TouchableOpacity style={[styles.gridCard, styles.gridAddCard]} onPress={() => setShowAddModule(true)}>
                <View style={[styles.gridIcon, { backgroundColor: c.orangeSoft }]}>
                  <Ionicons name="add" size={19} color={c.orange} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.gridName, { color: c.orange }]}>{t("pl.addModule")}</Text>
                  <Text style={styles.gridSub} numberOfLines={1}>{t("pl.expand")}</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
          {canManage && enabledModules.length > 0 && (
            <Text style={styles.gridHint}>{t("pl.longRemove")}</Text>
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
              <Text style={styles.emptyChat}>{t("pl.emptyChat")}</Text>
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
      ) : activeTab === "raffle" && plan ? (
        <RaffleModule planId={plan.id} members={plan.members} myRole={myRole} />
      ) : (
        <View style={styles.modulePlaceholder}>
          <View style={styles.modulePlaceholderIcon}>
            <Ionicons
              name={MODULE_CATALOG.find((m) => m.type === activeTab)?.icon ?? "cube-outline"}
              size={36}
              color={c.teal}
            />
          </View>
          <Text style={styles.modulePlaceholderTitle}>
            {t((MODULE_CATALOG.find((m) => m.type === activeTab)?.name ?? "pl.chat") as TKey)}
          </Text>
          <Text style={styles.modulePlaceholderText}>{t("pl.comingSoon")}</Text>
          <Text style={styles.modulePlaceholderHint}>{t("pl.longRemove")}</Text>
        </View>
      )}

      {/* Members & roles modal */}
      <Modal visible={showMembers} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t("scr.members")}</Text>
              <TouchableOpacity onPress={() => setShowMembers(false)}>
                <Ionicons name="close" size={22} color={c.muted} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.shareBtn}
              onPress={() => plan && shareInvite("plan", plan.title, plan.inviteCode)}
            >
              <Ionicons name="link-outline" size={16} color={c.onOrange} />
              <Text style={styles.shareBtnText}>{t("gr.shareLink")}</Text>
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
                  m.rsvp === "yes" ? c.teal
                  : m.rsvp === "no" ? c.danger
                  : m.rsvp === "maybe" ? "#F0A72B"
                  : c.faint;
                return (
                  <View key={m.user.id} style={styles.memberRow}>
                    <TouchableOpacity
                      style={{ flexDirection: "row", alignItems: "center", flex: 1 }}
                      onPress={() => { setShowMembers(false); setProfileUserId(m.user.id); }}
                    >
                      <View style={[styles.memberAvatar, { backgroundColor: userColor(m.user.id) }]}>
                        <Text style={styles.memberAvatarText}>{(m.user.name ?? "?")[0]?.toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.memberName}>
                          {isMe ? t("common.you") : m.user.name ?? "?"}
                        </Text>
                        {m.role !== "member" && (
                          <Text style={styles.memberRole}>{m.role === "admin" ? t("pl.admin") : t("pl.helper")}</Text>
                        )}
                      </View>
                    </TouchableOpacity>
                    <Ionicons name={rsvpIcon} size={18} color={rsvpColor} style={{ marginRight: 8 }} />
                    {isAdmin && !isMe && m.role !== "admin" && (
                      <TouchableOpacity
                        style={styles.roleBtn}
                        onPress={() => setRole(m.user.id, m.role === "helper" ? "member" : "helper")}
                      >
                        <Text style={styles.roleBtnText}>
                          {m.role === "helper" ? t("pl.removeHelper") : t("pl.makeHelper")}
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
                    <Text style={styles.inviteSectionTitle}>{t("pl.inviteFriends")}</Text>
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
                            <Ionicons name="checkmark" size={13} color={c.teal} />
                            <Text style={styles.invitedTag}>{t("pl.invited")}</Text>
                          </View>
                        ) : (
                          <TouchableOpacity style={styles.roleBtn} onPress={() => inviteFriend(f.id)}>
                            <Text style={styles.roleBtnText}>{t("common.invite")}</Text>
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
                <Ionicons name="sparkles" size={17} color={c.orange} />
                <Text style={styles.modalTitle}>{t("pl.assistant")}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowAi(false)}>
                <Ionicons name="close" size={22} color={c.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 320 }} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled">
              {aiAnswer ? (
                <View style={styles.aiAnswerBox}>
                  <Text style={styles.aiAnswerText}>{aiAnswer}</Text>
                </View>
              ) : (
                <Text style={styles.aiHint}>
                  {t("pl.askAnything")}{"\n\n"}
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
                placeholder={t("pl.askPh")}
                placeholderTextColor={c.faint}
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
                  : <Ionicons name="send" size={16} color={c.onOrange} />}
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
              <Text style={styles.modalTitle}>{t("pl.groupAvail")}</Text>
              <TouchableOpacity onPress={() => setShowDates(false)}>
                <Ionicons name="close" size={22} color={c.muted} />
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
              <Text style={styles.modalTitle}>{t("scr.planSettings")}</Text>
              <TouchableOpacity onPress={() => setShowSettings(false)}>
                <Ionicons name="close" size={22} color={c.muted} />
              </TouchableOpacity>
            </View>

            {canManage && (
              <TouchableOpacity style={styles.settingRow} onPress={openEdit}>
                <View style={styles.settingIconWrap}>
                  <Ionicons name="pencil-outline" size={18} color={c.teal} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingText}>{t("plan.editPlan")}</Text>
                  <Text style={styles.settingDesc}>{t("pl.editDesc")}</Text>
                </View>
              </TouchableOpacity>
            )}

            {canManage && (
              <TouchableOpacity style={styles.settingRow} onPress={bannerAction}>
                <View style={styles.settingIconWrap}>
                  <Ionicons name="image-outline" size={18} color={c.teal} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingText}>
                    {plan?.bannerImage ? t("pl.bannerChange") : t("pl.bannerAdd")}
                  </Text>
                  <Text style={styles.settingDesc}>{t("pl.bannerDesc")}</Text>
                </View>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.settingRow} onPress={saveTemplate}>
              <View style={styles.settingIconWrap}>
                <Ionicons name="documents-outline" size={18} color={c.teal} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingText}>{t("plan.saveTemplate")}</Text>
                <Text style={styles.settingDesc}>{t("pl.saveTplDesc")}</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.settingRow} onPress={() => { setShowSettings(false); leavePlan(); }}>
              <View style={styles.settingIconWrap}>
                <Ionicons name="exit-outline" size={18} color={c.teal} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingText}>{t("plan.leave")}</Text>
                <Text style={styles.settingDesc}>{t("pl.leaveDesc")}</Text>
              </View>
            </TouchableOpacity>

            {isAdmin && (
              <TouchableOpacity style={styles.settingRow} onPress={() => { setShowSettings(false); deletePlan(); }}>
                <View style={[styles.settingIconWrap, { backgroundColor: c.dangerSoft }]}>
                  <Ionicons name="trash-outline" size={18} color={c.danger} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settingText, { color: c.danger }]}>{t("plan.delete")}</Text>
                  <Text style={styles.settingDesc}>{t("pl.deleteDesc")}</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* Tapped-user profile */}
      <UserProfileSheet userId={profileUserId} onClose={() => setProfileUserId(null)} />

      {/* Edit plan modal */}
      <Modal visible={showEdit} animationType="slide" transparent>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { maxHeight: "88%" }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t("plan.editPlan")}</Text>
              <TouchableOpacity onPress={() => setShowEdit(false)}>
                <Ionicons name="close" size={22} color={c.muted} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.editLabel}>Title</Text>
              <TextInput
                style={styles.editInput}
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="Plan title"
                placeholderTextColor={c.faint}
              />

              <Text style={styles.editLabel}>Location</Text>
              <TextInput
                style={styles.editInput}
                value={editLocation}
                onChangeText={setEditLocation}
                placeholder="The park"
                placeholderTextColor={c.faint}
              />

              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.editLabel}>Date — DD/MM</Text>
                  <TextInput
                    style={styles.editInput}
                    value={editDate}
                    onChangeText={setEditDate}
                    placeholder="18/07"
                    placeholderTextColor={c.faint}
                    autoCapitalize="none"
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.editLabel}>Time — HH:MM</Text>
                  <TextInput
                    style={styles.editInput}
                    value={editTime}
                    onChangeText={setEditTime}
                    placeholder="18:00"
                    placeholderTextColor={c.faint}
                    autoCapitalize="none"
                  />
                </View>
              </View>

              <Text style={styles.editLabel}>Description</Text>
              <TextInput
                style={[styles.editInput, { height: 80 }]}
                value={editDesc}
                onChangeText={setEditDesc}
                placeholder="Bring your boots!"
                placeholderTextColor={c.faint}
                multiline
                textAlignVertical="top"
              />

              <TouchableOpacity
                style={[styles.editSaveBtn, (!editTitle.trim() || savingEdit) && { opacity: 0.5 }]}
                onPress={saveEdit}
                disabled={!editTitle.trim() || savingEdit}
              >
                <Text style={styles.editSaveText}>{savingEdit ? "..." : "Save changes"}</Text>
              </TouchableOpacity>
              <View style={{ height: 12 }} />
            </ScrollView>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add module modal */}
      <Modal visible={showAddModule} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t("scr.addModule")}</Text>
              <TouchableOpacity onPress={() => setShowAddModule(false)}>
                <Ionicons name="close" size={22} color={c.muted} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {availableModules.length === 0 ? (
                <Text style={styles.emptyChat}>{t("pl.allAdded")}</Text>
              ) : (
                availableModules.map((m) => (
                  <TouchableOpacity key={m.type} style={styles.moduleRow} onPress={() => addModule(m.type)}>
                    <View style={styles.moduleIconWrap}>
                      <Ionicons name={m.icon} size={19} color={c.teal} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.moduleName}>{t(m.name as TKey)}</Text>
                      <Text style={styles.moduleDesc}>{t(m.desc as TKey)}</Text>
                    </View>
                    <Ionicons name="add-circle-outline" size={22} color={c.orange} />
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

const getStyles = themedStyles((c: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  header: {
    padding: 20, paddingTop: 60, paddingBottom: 12,
    backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.line,
  },
  headerTopRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  backText: { color: c.teal, fontSize: 15, fontFamily: font.bodySemi },
  membersBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  membersBtnText: { color: c.teal, fontSize: 13.5, fontFamily: font.semi },
  title: { fontSize: 20, fontFamily: font.title, color: c.ink, letterSpacing: -0.3 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 5, flexWrap: "wrap" },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  meta: { color: c.muted, fontSize: 12.5, fontFamily: font.bodyMedium },
  roleChip: {
    backgroundColor: c.orangeSoft, borderRadius: radius.pill,
    paddingHorizontal: 9, paddingVertical: 2,
  },
  roleChipText: { color: c.orange, fontSize: 11, fontFamily: font.semi },
  rsvpRow: { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  rsvpBtn: {
    flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 5,
    backgroundColor: c.surface, borderRadius: radius.md, padding: 10,
    borderWidth: 1.5, borderColor: c.line,
  },
  rsvpText: { color: c.muted, fontSize: 12.5, fontFamily: font.semi },
  moduleBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: c.line, backgroundColor: c.surface,
  },
  moduleBarBack: { flexDirection: "row", alignItems: "center", gap: 4, width: 92 },
  moduleBarBackText: { color: c.teal, fontSize: 13.5, fontFamily: font.bodySemi },
  moduleBarTitle: { color: c.ink, fontSize: 15, fontFamily: font.semi, letterSpacing: -0.2 },
  gridWrap: { padding: 14, paddingTop: 4 },
  gridLabel: {
    fontSize: 11, fontFamily: font.semi, letterSpacing: 1, textTransform: "uppercase",
    color: c.muted, marginBottom: 10, marginLeft: 4,
  },
  grid: {},
  gridCard: {
    width: "100%", flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: c.surface, borderRadius: radius.lg, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: c.line, ...shadow.card,
  },
  gridAddCard: { borderStyle: "dashed", borderColor: c.orange, shadowOpacity: 0, elevation: 0 },
  gridIcon: {
    width: 36, height: 36, borderRadius: 11,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  gridName: { color: c.ink, fontSize: 13, fontFamily: font.semi, letterSpacing: -0.1 },
  gridSub: { color: c.muted, fontSize: 10.5, fontFamily: font.bodyMedium, marginTop: 1 },
  gridSubNew: { color: c.orange, fontFamily: font.bodySemi },
  gridDot: {
    position: "absolute", top: 8, right: 8, width: 8, height: 8, borderRadius: 4,
    backgroundColor: c.orange, zIndex: 1,
  },
  gridHint: { color: c.faint, fontSize: 11.5, fontFamily: font.body, textAlign: "center", marginTop: 6 },
  chat: { flex: 1, paddingHorizontal: 12, paddingTop: 8 },
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
  modulePlaceholder: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  modulePlaceholderIcon: {
    width: 80, height: 80, borderRadius: 24, backgroundColor: c.tealSoft,
    alignItems: "center", justifyContent: "center",
  },
  modulePlaceholderTitle: { color: c.ink, fontSize: 20, fontFamily: font.title, marginTop: 12 },
  modulePlaceholderText: { color: c.muted, fontSize: 14, fontFamily: font.bodyMedium, marginTop: 8 },
  modulePlaceholderHint: { color: c.faint, fontSize: 12, fontFamily: font.body, marginTop: 24 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(7,32,48,0.55)", justifyContent: "flex-end" },
  modal: {
    backgroundColor: c.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, maxHeight: "75%",
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { color: c.ink, fontSize: 19, fontFamily: font.title },
  moduleRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: c.surface,
    borderRadius: radius.lg, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: c.line,
  },
  moduleIconWrap: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: c.tealSoft,
    alignItems: "center", justifyContent: "center", marginRight: 12,
  },
  moduleName: { color: c.ink, fontSize: 15, fontFamily: font.semi },
  moduleDesc: { color: c.muted, fontSize: 12.5, fontFamily: font.body, marginTop: 2 },
  memberRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: c.surface,
    borderRadius: radius.md, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: c.line,
  },
  memberAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", marginRight: 11 },
  memberAvatarText: { color: "#fff", fontFamily: font.semi, fontSize: 14 },
  memberName: { color: c.ink, fontSize: 14.5, fontFamily: font.bodySemi },
  memberRole: { color: c.teal, fontSize: 11.5, fontFamily: font.semi, marginTop: 1 },
  roleBtn: {
    backgroundColor: c.tealSoft, borderRadius: radius.sm,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  roleBtnText: { color: c.teal, fontSize: 12, fontFamily: font.semi },
  aiAnswerBox: {
    backgroundColor: c.surface, borderRadius: radius.lg, padding: 16,
    borderWidth: 1, borderColor: c.line,
  },
  aiAnswerText: { color: c.ink, fontSize: 14, fontFamily: font.bodyMedium, lineHeight: 22 },
  aiHint: { color: c.muted, fontSize: 13.5, fontFamily: font.body, lineHeight: 22, padding: 8 },
  aiInputRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  aiInput: {
    flex: 1, backgroundColor: c.surface, borderRadius: radius.md, padding: 14,
    color: c.ink, fontSize: 14.5, fontFamily: font.bodyMedium,
    borderWidth: 1, borderColor: c.line,
  },
  aiSendBtn: {
    backgroundColor: c.orange, borderRadius: radius.md, width: 50,
    alignItems: "center", justifyContent: "center", ...shadow.orange,
  },
  aiSendText: { color: c.onOrange, fontSize: 17, fontFamily: font.semi },
  shareBtn: {
    flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 7,
    backgroundColor: c.orange, borderRadius: radius.md, padding: 13,
    marginBottom: 12, ...shadow.orange,
  },
  shareBtnText: { color: c.onOrange, fontSize: 14, fontFamily: font.semi },
  inviteSectionTitle: {
    color: c.muted, fontSize: 11, fontFamily: font.semi, letterSpacing: 1,
    textTransform: "uppercase", marginTop: 16, marginBottom: 8,
  },
  invitedTagRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  invitedTag: { color: c.teal, fontSize: 12.5, fontFamily: font.semi },
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
  editLabel: { color: c.ink, fontSize: 13, fontFamily: font.bodySemi, marginBottom: 8 },
  editInput: {
    backgroundColor: c.surface, borderRadius: radius.md, padding: 14, color: c.ink,
    fontSize: 14.5, fontFamily: font.bodyMedium, marginBottom: 14, borderWidth: 1, borderColor: c.line,
  },
  editSaveBtn: {
    backgroundColor: c.orange, borderRadius: radius.lg, padding: 16,
    alignItems: "center", marginTop: 4, ...shadow.orange,
  },
  editSaveText: { color: c.onOrange, fontSize: 15, fontFamily: font.semi },
}));
