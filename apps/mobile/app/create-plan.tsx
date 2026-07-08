import { useEffect, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { api } from "../lib/api";

type Group = {
  id: string;
  name: string;
  members: { user: { id: string; name: string | null } }[];
};

type Friend = { id: string; name: string | null; username: string | null };

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

  useEffect(() => {
    api.get("/groups").then((res) => setGroups(res.data)).catch(() => {});
    api.get("/friends").then((res) => setFriends(res.data)).catch(() => {});
  }, []);

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
      if (date.trim()) {
        startDate = time.trim() ? `${date.trim()}T${time.trim()}:00` : `${date.trim()}T00:00:00`;
      } else if (type === "quick") {
        startDate = new Date().toISOString();
      }

      const res = await api.post("/plans", {
        title: title.trim(),
        description: description.trim() || undefined,
        location: location.trim() || undefined,
        type,
        startDate,
        groupIds: [...selectedGroups],
        memberIds: [...selectedFriends],
      });
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

      <Text style={styles.label}>Invite groups</Text>
      {groups.length === 0 ? (
        <Text style={styles.hint}>You have no groups yet — create one in the Groups tab. You can still create the plan and invite people later.</Text>
      ) : (
        groups.map((g) => {
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
      )}

      <Text style={styles.label}>Invite friends</Text>
      {friends.length === 0 ? (
        <Text style={styles.hint}>Add friends from Profile → Friends to invite them individually.</Text>
      ) : (
        friends.map((f) => {
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
      )}

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
          <Text style={styles.label}>Date (optional) — YYYY-MM-DD</Text>
          <TextInput
            style={styles.input}
            placeholder="2026-07-18"
            placeholderTextColor="#475569"
            value={date}
            onChangeText={setDate}
            autoCapitalize="none"
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
});
