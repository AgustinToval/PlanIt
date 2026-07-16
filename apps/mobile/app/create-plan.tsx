import { useEffect, useMemo, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, Modal,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
import { shareInvite } from "../lib/invite";
import { font, radius, shadow, userColor, Palette, themedStyles } from "../lib/theme";
import { useTheme, useT } from "../hooks/useSettings";

type Group = {
  id: string;
  name: string;
  members: { user: { id: string; name: string | null } }[];
};

type Friend = { id: string; name: string | null; username: string | null };

type Template = {
  id: string;
  name: string;
  createdAt: string;
  data: { modules: string[]; checkItems: unknown[]; activities: unknown[] };
};

export default function CreatePlanScreen() {
  const c = useTheme();
  const styles = getStyles(c);
  const t = useT();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [date, setDate] = useState(""); // YYYY-MM-DD
  const [time, setTime] = useState(""); // HH:MM
  const [type, setType] = useState<"full" | "quick">("full");
  const [groups, setGroups] = useState<Group[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState<"groups" | "friends" | null>(null);
  const [search, setSearch] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);

  const filteredGroups = useMemo(
    () => groups.filter((g) => g.name.toLowerCase().includes(search.toLowerCase())),
    [groups, search]
  );
  const filteredFriends = useMemo(
    () =>
      friends.filter((f) =>
        (f.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (f.username ?? "").toLowerCase().includes(search.toLowerCase())
      ),
    [friends, search]
  );

  useEffect(() => {
    api.get("/groups").then((res) => setGroups(res.data)).catch(() => {});
    api.get("/friends").then((res) => setFriends(res.data)).catch(() => {});
    api.get("/plans/templates/mine").then((res) => setTemplates(res.data)).catch(() => {});
  }, []);

  const pickTemplate = (t: Template) => {
    setSelectedTemplate(t);
    if (!title.trim()) setTitle(t.name);
    setShowTemplates(false);
  };

  const deleteTemplate = (t: Template) => {
    Alert.alert("Delete template?", t.name, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/plans/templates/${t.id}`);
            setTemplates((prev) => prev.filter((x) => x.id !== t.id));
            if (selectedTemplate?.id === t.id) setSelectedTemplate(null);
          } catch { /* noop */ }
        },
      },
    ]);
  };

  const toggleGroup = (id: string) => {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleFriend = (id: string) => {
    setSelectedFriends((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const joinPlan = async () => {
    if (!joinCode.trim()) return;
    setBusy(true);
    try {
      const res = await api.post(`/plans/join/${joinCode.trim()}`);
      router.replace(`/plan/${res.data.plan.id}`);
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.error ?? "Invalid invite code");
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      let startDate: string | undefined;
      const dm = date.trim().match(/^(\d{1,2})\/(\d{1,2})$/); // DD/MM
      if (dm) {
        const day = dm[1]!.padStart(2, "0");
        const month = dm[2]!.padStart(2, "0");
        const now = new Date();
        let year = now.getFullYear();
        // if that day/month already passed this year, assume next year
        const candidate = new Date(`${year}-${month}-${day}T23:59:59`);
        if (candidate.getTime() < now.getTime()) year += 1;
        const hhmm = /^\d{1,2}:\d{2}$/.test(time.trim()) ? time.trim().padStart(5, "0") : "00:00";
        startDate = `${year}-${month}-${day}T${hhmm}:00`;
      } else if (type === "quick") {
        startDate = new Date().toISOString();
      }

      let res;
      if (selectedTemplate) {
        // Create from template: brings modules, checklist and activities along
        res = await api.post(`/plans/templates/${selectedTemplate.id}/use`, {
          title: title.trim(),
          location: location.trim() || undefined,
          startDate,
          groupIds: [...selectedGroups],
          memberIds: [...selectedFriends],
        });
      } else {
        res = await api.post("/plans", {
          title: title.trim(),
          description: description.trim() || undefined,
          location: location.trim() || undefined,
          type,
          startDate,
          groupIds: [...selectedGroups],
          memberIds: [...selectedFriends],
        });
      }
      const plan = res.data;
      router.replace(`/plan/${plan.id}`);
      // Only offer the invite link if nobody was added to the plan
      const nobodyAdded = selectedGroups.size === 0 && selectedFriends.size === 0;
      if (plan.inviteCode && nobodyAdded) {
        Alert.alert(
          "Plan created!",
          "You didn't invite anyone yet — share an invite link?",
          [
            { text: "Later", style: "cancel" },
            { text: "Share link", onPress: () => shareInvite("plan", plan.title, plan.inviteCode) },
          ]
        );
      }
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.error ?? "Could not create the plan");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <TouchableOpacity onPress={() => router.back()} style={styles.back}>
        <Ionicons name="chevron-back" size={18} color={c.teal} />
        <Text style={styles.backText}>{t("common.back")}</Text>
      </TouchableOpacity>

      <Text style={styles.title}>{t("scr.newPlan")}</Text>

      {templates.length > 0 && (
        <TouchableOpacity style={styles.templateBtn} onPress={() => setShowTemplates(true)}>
          <View style={styles.templateIconWrap}>
            <Ionicons name="documents-outline" size={18} color={c.onOrange} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.templateTitle}>
              {selectedTemplate ? `Template: ${selectedTemplate.name}` : "Start from a template"}
            </Text>
            <Text style={styles.templateMeta}>
              {selectedTemplate
                ? `${selectedTemplate.data.modules.length} modules · ${selectedTemplate.data.checkItems.length} items · ${selectedTemplate.data.activities.length} activities`
                : `${templates.length} saved template${templates.length > 1 ? "s" : ""}`}
            </Text>
          </View>
          {selectedTemplate ? (
            <TouchableOpacity onPress={() => setSelectedTemplate(null)} style={{ padding: 6 }}>
              <Ionicons name="close" size={18} color={c.onOrange} />
            </TouchableOpacity>
          ) : (
            <Ionicons name="chevron-forward" size={17} color={c.onOrange} />
          )}
        </TouchableOpacity>
      )}

      <View style={styles.typeRow}>
        <TouchableOpacity
          style={[styles.typeBtn, type === "full" && styles.typeBtnActive]}
          onPress={() => setType("full")}
        >
          <View style={styles.typeBtnTitleRow}>
            <Ionicons name="calendar-clear-outline" size={15} color={type === "full" ? c.teal : c.muted} />
            <Text style={[styles.typeBtnText, type === "full" && styles.typeBtnTextActive]}>Full Plan</Text>
          </View>
          <Text style={styles.typeBtnSub}>Trips, dinners, events</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.typeBtn, type === "quick" && styles.typeBtnActiveQuick]}
          onPress={() => setType("quick")}
        >
          <View style={styles.typeBtnTitleRow}>
            <Ionicons name="flash" size={15} color={type === "quick" ? c.orange : c.muted} />
            <Text style={[styles.typeBtnText, type === "quick" && styles.typeBtnTextActive]}>Quick Plan</Text>
          </View>
          <Text style={styles.typeBtnSub}>Today — who's in?</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Title</Text>
      <TextInput
        style={styles.input}
        placeholder={type === "quick" ? "Football at 6pm" : "Camping July"}
        placeholderTextColor={c.faint}
        value={title}
        onChangeText={setTitle}
      />

      <Text style={styles.label}>Who's invited?</Text>
      <TouchableOpacity style={styles.pickerBtn} onPress={() => { setSearch(""); setPicker("groups"); }}>
        <View style={styles.pickerIconWrap}>
          <Ionicons name="people-outline" size={18} color={c.teal} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.pickerTitle}>Groups</Text>
          <Text style={styles.pickerMeta} numberOfLines={1}>
            {selectedGroups.size === 0
              ? "None selected"
              : groups.filter((g) => selectedGroups.has(g.id)).map((g) => g.name).join(", ")}
          </Text>
        </View>
        <Text style={styles.pickerCount}>{selectedGroups.size > 0 ? `${selectedGroups.size}` : ""}</Text>
        <Ionicons name="chevron-forward" size={16} color={c.teal} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.pickerBtn} onPress={() => { setSearch(""); setPicker("friends"); }}>
        <View style={styles.pickerIconWrap}>
          <Ionicons name="person-add-outline" size={17} color={c.teal} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.pickerTitle}>{t("scr.friends")}</Text>
          <Text style={styles.pickerMeta} numberOfLines={1}>
            {selectedFriends.size === 0
              ? "None selected"
              : friends.filter((f) => selectedFriends.has(f.id)).map((f) => f.name ?? "?").join(", ")}
          </Text>
        </View>
        <Text style={styles.pickerCount}>{selectedFriends.size > 0 ? `${selectedFriends.size}` : ""}</Text>
        <Ionicons name="chevron-forward" size={16} color={c.teal} />
      </TouchableOpacity>

      <Text style={styles.label}>Location (optional)</Text>
      <TextInput
        style={styles.input}
        placeholder="The park"
        placeholderTextColor={c.faint}
        value={location}
        onChangeText={setLocation}
      />

      {type === "full" && (
        <>
          <Text style={styles.label}>Date (optional) — DD/MM</Text>
          <TextInput
            style={styles.input}
            placeholder="18/07"
            placeholderTextColor={c.faint}
            value={date}
            onChangeText={setDate}
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
          />
        </>
      )}

      <Text style={styles.label}>Time (optional) — HH:MM</Text>
      <TextInput
        style={styles.input}
        placeholder="18:00"
        placeholderTextColor={c.faint}
        value={time}
        onChangeText={setTime}
        autoCapitalize="none"
      />

      <Text style={styles.label}>Description (optional)</Text>
      <TextInput
        style={[styles.input, { height: 80 }]}
        placeholder="Bring your boots!"
        placeholderTextColor={c.faint}
        value={description}
        onChangeText={setDescription}
        multiline
        textAlignVertical="top"
      />

      <TouchableOpacity
        style={[styles.button, (!title.trim() || busy) && styles.buttonDisabled]}
        onPress={create}
        disabled={!title.trim() || busy}
      >
        <Text style={styles.buttonText}>{busy ? "..." : type === "quick" ? "Send it!" : "Create Plan"}</Text>
      </TouchableOpacity>

      <View style={styles.divider}>
        <View style={styles.line} />
        <Text style={styles.dividerText}>or join a plan</Text>
        <View style={styles.line} />
      </View>

      <Text style={styles.label}>Invite code</Text>
      <TextInput
        style={styles.input}
        placeholder="Paste plan invite code"
        placeholderTextColor={c.faint}
        value={joinCode}
        onChangeText={setJoinCode}
        autoCapitalize="none"
      />
      <TouchableOpacity
        style={[styles.buttonOutline, (!joinCode.trim() || busy) && styles.buttonDisabled]}
        onPress={joinPlan}
        disabled={!joinCode.trim() || busy}
      >
        <Text style={styles.buttonOutlineText}>Join Plan</Text>
      </TouchableOpacity>

      <View style={{ height: 60 }} />

      {/* Templates modal */}
      <Modal visible={showTemplates} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>My templates</Text>
              <TouchableOpacity onPress={() => setShowTemplates(false)}>
                <Text style={styles.modalDone}>Close</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 400 }}>
              {templates.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={styles.groupRow}
                  onPress={() => pickTemplate(t)}
                  onLongPress={() => deleteTemplate(t)}
                >
                  <View style={styles.pickerIconWrap}>
                    <Ionicons name="documents-outline" size={18} color={c.teal} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.groupName}>{t.name}</Text>
                    <Text style={styles.groupMeta}>
                      {t.data.modules.length} modules · {t.data.checkItems.length} items · {t.data.activities.length} activities
                    </Text>
                  </View>
                  <Ionicons
                    name={selectedTemplate?.id === t.id ? "checkmark-circle" : "chevron-forward"}
                    size={20}
                    color={selectedTemplate?.id === t.id ? c.teal : c.faint}
                  />
                </TouchableOpacity>
              ))}
              <Text style={styles.hint}>Long-press a template to delete it</Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Picker modal (groups / friends) with search */}
      <Modal visible={picker !== null} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {picker === "groups" ? "Invite groups" : "Invite friends"}
              </Text>
              <TouchableOpacity onPress={() => setPicker(null)}>
                <Text style={styles.modalDone}>Done</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Search..."
              placeholderTextColor={c.faint}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
            />

            <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
              {picker === "groups" && (
                filteredGroups.length === 0 ? (
                  <Text style={styles.hint}>
                    {groups.length === 0
                      ? "You have no groups yet — create one in the Groups tab."
                      : "No groups match your search."}
                  </Text>
                ) : (
                  filteredGroups.map((g) => {
                    const selected = selectedGroups.has(g.id);
                    return (
                      <TouchableOpacity
                        key={g.id}
                        style={[styles.groupRow, selected && styles.groupRowActive]}
                        onPress={() => toggleGroup(g.id)}
                      >
                        <View style={[styles.groupAvatar, { backgroundColor: userColor(g.id) }]}>
                          <Text style={styles.groupAvatarText}>{g.name[0]?.toUpperCase()}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.groupName}>{g.name}</Text>
                          <Text style={styles.groupMeta}>{g.members.length} members</Text>
                        </View>
                        <Ionicons
                          name={selected ? "checkbox" : "square-outline"}
                          size={20}
                          color={selected ? c.orange : c.faint}
                        />
                      </TouchableOpacity>
                    );
                  })
                )
              )}

              {picker === "friends" && (
                filteredFriends.length === 0 ? (
                  <Text style={styles.hint}>
                    {friends.length === 0
                      ? "Add friends from Profile → Friends to invite them individually."
                      : "No friends match your search."}
                  </Text>
                ) : (
                  filteredFriends.map((f) => {
                    const selected = selectedFriends.has(f.id);
                    return (
                      <TouchableOpacity
                        key={f.id}
                        style={[styles.groupRow, selected && styles.groupRowActive]}
                        onPress={() => toggleFriend(f.id)}
                      >
                        <View style={[styles.groupAvatar, { backgroundColor: userColor(f.id) }]}>
                          <Text style={styles.groupAvatarText}>{(f.name ?? "?")[0]?.toUpperCase()}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.groupName}>{f.name ?? "?"}</Text>
                          {f.username && <Text style={styles.groupMeta}>@{f.username}</Text>}
                        </View>
                        <Ionicons
                          name={selected ? "checkbox" : "square-outline"}
                          size={20}
                          color={selected ? c.orange : c.faint}
                        />
                      </TouchableOpacity>
                    );
                  })
                )
              )}
            </ScrollView>
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
  typeRow: { flexDirection: "row", gap: 12, marginBottom: 24 },
  typeBtn: {
    flex: 1, backgroundColor: c.surface, borderRadius: radius.lg, padding: 15,
    borderWidth: 1.5, borderColor: c.line,
  },
  typeBtnActive: { borderColor: c.teal, backgroundColor: c.tealSoft },
  typeBtnActiveQuick: { borderColor: c.orange, backgroundColor: c.orangeSoft },
  typeBtnTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  typeBtnText: { color: c.muted, fontSize: 14, fontFamily: font.semi },
  typeBtnTextActive: { color: c.ink },
  typeBtnSub: { color: c.faint, fontSize: 11.5, fontFamily: font.body, marginTop: 4 },
  label: { color: c.ink, fontSize: 13, fontFamily: font.bodySemi, marginBottom: 8 },
  input: {
    backgroundColor: c.surface, borderRadius: radius.md, padding: 15, color: c.ink,
    fontSize: 15, fontFamily: font.bodyMedium, marginBottom: 16, borderWidth: 1, borderColor: c.line,
  },
  hint: { color: c.muted, fontSize: 12.5, fontFamily: font.body, marginBottom: 16, lineHeight: 18 },
  groupRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: c.surface,
    borderRadius: radius.md, padding: 12, marginBottom: 8, borderWidth: 1.5, borderColor: c.line,
  },
  groupRowActive: { borderColor: c.orange },
  groupAvatar: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center", marginRight: 12,
  },
  groupAvatarText: { color: "#fff", fontFamily: font.title, fontSize: 15 },
  groupName: { color: c.ink, fontSize: 15, fontFamily: font.bodySemi },
  groupMeta: { color: c.muted, fontSize: 12.5, fontFamily: font.body },
  button: {
    backgroundColor: c.orange, borderRadius: radius.lg, padding: 17,
    alignItems: "center", marginTop: 16, ...shadow.orange,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: c.onOrange, fontSize: 16, fontFamily: font.semi },
  divider: { flexDirection: "row", alignItems: "center", marginVertical: 28 },
  line: { flex: 1, height: 1, backgroundColor: c.line },
  dividerText: { color: c.faint, marginHorizontal: 12, fontSize: 13, fontFamily: font.bodyMedium },
  buttonOutline: {
    borderRadius: radius.lg, padding: 16, alignItems: "center",
    borderWidth: 1.5, borderColor: c.teal, backgroundColor: c.surface,
  },
  buttonOutlineText: { color: c.teal, fontSize: 16, fontFamily: font.semi },
  pickerBtn: {
    flexDirection: "row", alignItems: "center", backgroundColor: c.surface,
    borderRadius: radius.md, padding: 13, marginBottom: 10, borderWidth: 1, borderColor: c.line,
  },
  pickerIconWrap: {
    width: 36, height: 36, borderRadius: 11, backgroundColor: c.tealSoft,
    alignItems: "center", justifyContent: "center", marginRight: 12,
  },
  pickerTitle: { color: c.ink, fontSize: 14.5, fontFamily: font.semi },
  pickerMeta: { color: c.muted, fontSize: 12.5, fontFamily: font.body, marginTop: 2 },
  pickerCount: { color: c.orange, fontSize: 14, fontFamily: font.semi, marginRight: 4 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(7,32,48,0.55)", justifyContent: "flex-end" },
  modal: {
    backgroundColor: c.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 40, maxHeight: "85%",
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  modalTitle: { color: c.ink, fontSize: 19, fontFamily: font.title },
  modalDone: { color: c.teal, fontSize: 15.5, fontFamily: font.semi },
  templateBtn: {
    flexDirection: "row", alignItems: "center", backgroundColor: c.petrol,
    borderRadius: radius.md, padding: 13, marginBottom: 16, ...shadow.card,
  },
  templateIconWrap: {
    width: 36, height: 36, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center", justifyContent: "center", marginRight: 12,
  },
  templateTitle: { color: "#FFFFFF", fontSize: 14.5, fontFamily: font.semi },
  templateMeta: { color: "#8FB0C0", fontSize: 12, fontFamily: font.bodyMedium, marginTop: 2 },
}));
