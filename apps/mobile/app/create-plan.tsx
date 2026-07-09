import { useEffect, useMemo, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, Modal,
} from "react-native";
import { useRouter } from "expo-router";
import { api } from "../lib/api";

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
      router.replace(`/plan/${res.data.id}`);
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.error ?? "Could not create the plan");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <TouchableOpacity onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>‹ Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>New Plan</Text>

      {templates.length > 0 && (
        <TouchableOpacity style={styles.templateBtn} onPress={() => setShowTemplates(true)}>
          <Text style={styles.templateIcon}>📑</Text>
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
            <TouchableOpacity onPress={() => setSelectedTemplate(null)}>
              <Text style={styles.templateClear}>✕</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.pickerCount}>›</Text>
          )}
        </TouchableOpacity>
      )}

      <View style={styles.typeRow}>
        <TouchableOpacity
          style={[styles.typeBtn, type === "full" && styles.typeBtnActive]}
          onPress={() => setType("full")}
        >
          <Text style={[styles.typeBtnText, type === "full" && styles.typeBtnTextActive]}>🗓️ Full Plan</Text>
          <Text style={styles.typeBtnSub}>Trips, dinners, events</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.typeBtn, type === "quick" && styles.typeBtnActive]}
          onPress={() => setType("quick")}
        >
          <Text style={[styles.typeBtnText, type === "quick" && styles.typeBtnTextActive]}>⚡ Quick Plan</Text>
          <Text style={styles.typeBtnSub}>Today — who's in?</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Title</Text>
      <TextInput
        style={styles.input}
        placeholder={type === "quick" ? "Football at 6pm" : "Camping July"}
        placeholderTextColor="#475569"
        value={title}
        onChangeText={setTitle}
      />

      <Text style={styles.label}>Who's invited?</Text>
      <TouchableOpacity style={styles.pickerBtn} onPress={() => { setSearch(""); setPicker("groups"); }}>
        <Text style={styles.pickerIcon}>👥</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.pickerTitle}>Groups</Text>
          <Text style={styles.pickerMeta}>
            {selectedGroups.size === 0
              ? "None selected"
              : groups.filter((g) => selectedGroups.has(g.id)).map((g) => g.name).join(", ")}
          </Text>
        </View>
        <Text style={styles.pickerCount}>{selectedGroups.size > 0 ? `${selectedGroups.size} ›` : "›"}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.pickerBtn} onPress={() => { setSearch(""); setPicker("friends"); }}>
        <Text style={styles.pickerIcon}>🤝</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.pickerTitle}>Friends</Text>
          <Text style={styles.pickerMeta}>
            {selectedFriends.size === 0
              ? "None selected"
              : friends.filter((f) => selectedFriends.has(f.id)).map((f) => f.name ?? "?").join(", ")}
          </Text>
        </View>
        <Text style={styles.pickerCount}>{selectedFriends.size > 0 ? `${selectedFriends.size} ›` : "›"}</Text>
      </TouchableOpacity>

      <Text style={styles.label}>Location (optional)</Text>
      <TextInput
        style={styles.input}
        placeholder="The park"
        placeholderTextColor="#475569"
        value={location}
        onChangeText={setLocation}
      />

      {type === "full" && (
        <>
          <Text style={styles.label}>Date (optional) — DD/MM</Text>
          <TextInput
            style={styles.input}
            placeholder="18/07"
            placeholderTextColor="#475569"
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
        placeholderTextColor="#475569"
        value={time}
        onChangeText={setTime}
        autoCapitalize="none"
      />

      <Text style={styles.label}>Description (optional)</Text>
      <TextInput
        style={[styles.input, { height: 80 }]}
        placeholder="Bring your boots!"
        placeholderTextColor="#475569"
        value={description}
        onChangeText={setDescription}
        multiline
      />

      <TouchableOpacity
        style={[styles.button, (!title.trim() || busy) && styles.buttonDisabled]}
        onPress={create}
        disabled={!title.trim() || busy}
      >
        <Text style={styles.buttonText}>{busy ? "..." : type === "quick" ? "⚡ Send it!" : "Create Plan"}</Text>
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
        placeholderTextColor="#475569"
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
                  <Text style={{ fontSize: 24, marginRight: 12 }}>📑</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.groupName}>{t.name}</Text>
                    <Text style={styles.groupMeta}>
                      {t.data.modules.length} modules · {t.data.checkItems.length} items · {t.data.activities.length} activities
                    </Text>
                  </View>
                  <Text style={styles.check}>{selectedTemplate?.id === t.id ? "✅" : "›"}</Text>
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
              placeholderTextColor="#475569"
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
                        <View style={styles.groupAvatar}>
                          <Text style={styles.groupAvatarText}>{g.name[0]?.toUpperCase()}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.groupName}>{g.name}</Text>
                          <Text style={styles.groupMeta}>{g.members.length} members</Text>
                        </View>
                        <Text style={styles.check}>{selected ? "✅" : "⬜"}</Text>
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
                        <View style={styles.groupAvatar}>
                          <Text style={styles.groupAvatarText}>{(f.name ?? "?")[0]?.toUpperCase()}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.groupName}>{f.name ?? "?"}</Text>
                          {f.username && <Text style={styles.groupMeta}>@{f.username}</Text>}
                        </View>
                        <Text style={styles.check}>{selected ? "✅" : "⬜"}</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a", padding: 24, paddingTop: 60 },
  back: { marginBottom: 16 },
  backText: { color: "#6366f1", fontSize: 17 },
  title: { fontSize: 28, fontWeight: "800", color: "#ffffff", marginBottom: 20 },
  typeRow: { flexDirection: "row", gap: 12, marginBottom: 24 },
  typeBtn: { flex: 1, backgroundColor: "#1e293b", borderRadius: 16, padding: 16, borderWidth: 2, borderColor: "transparent" },
  typeBtnActive: { borderColor: "#6366f1" },
  typeBtnText: { color: "#94a3b8", fontSize: 15, fontWeight: "700" },
  typeBtnTextActive: { color: "#ffffff" },
  typeBtnSub: { color: "#475569", fontSize: 12, marginTop: 4 },
  label: { color: "#cbd5e1", fontSize: 14, fontWeight: "600", marginBottom: 8 },
  input: {
    backgroundColor: "#1e293b", borderRadius: 14, padding: 16, color: "#ffffff",
    fontSize: 16, marginBottom: 16, borderWidth: 1, borderColor: "#334155",
  },
  hint: { color: "#64748b", fontSize: 13, marginBottom: 16, lineHeight: 18 },
  groupRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#1e293b",
    borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 2, borderColor: "transparent",
  },
  groupRowActive: { borderColor: "#6366f1" },
  groupAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#6366f1", alignItems: "center", justifyContent: "center", marginRight: 12 },
  groupAvatarText: { color: "#ffffff", fontWeight: "800", fontSize: 16 },
  groupName: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
  groupMeta: { color: "#64748b", fontSize: 13 },
  check: { fontSize: 18 },
  button: { backgroundColor: "#6366f1", borderRadius: 16, padding: 18, alignItems: "center", marginTop: 16 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#ffffff", fontSize: 17, fontWeight: "700" },
  divider: { flexDirection: "row", alignItems: "center", marginVertical: 28 },
  line: { flex: 1, height: 1, backgroundColor: "#1e293b" },
  dividerText: { color: "#475569", marginHorizontal: 12, fontSize: 14 },
  buttonOutline: { borderRadius: 16, padding: 18, alignItems: "center", borderWidth: 2, borderColor: "#6366f1" },
  buttonOutlineText: { color: "#6366f1", fontSize: 17, fontWeight: "700" },
  pickerBtn: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#1e293b",
    borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: "#334155",
  },
  pickerIcon: { fontSize: 22, marginRight: 12 },
  pickerTitle: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  pickerMeta: { color: "#64748b", fontSize: 13, marginTop: 2 },
  pickerCount: { color: "#6366f1", fontSize: 16, fontWeight: "700" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modal: { backgroundColor: "#0f172a", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, maxHeight: "85%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  modalTitle: { color: "#ffffff", fontSize: 20, fontWeight: "800" },
  modalDone: { color: "#6366f1", fontSize: 17, fontWeight: "700" },
  templateBtn: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#312e81",
    borderRadius: 14, padding: 14, marginBottom: 16,
  },
  templateIcon: { fontSize: 22, marginRight: 12 },
  templateTitle: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  templateMeta: { color: "#a5b4fc", fontSize: 12, marginTop: 2 },
  templateClear: { color: "#c7d2fe", fontSize: 18, paddingHorizontal: 8 },
});
