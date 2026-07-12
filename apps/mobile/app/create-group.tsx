import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { api } from "../lib/api";
import { shareInvite } from "../lib/invite";

export default function CreateGroupScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);

  const createGroup = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await api.post("/groups", { name: name.trim(), description: description.trim() || undefined });
      const g = res.data;
      router.replace(`/group/${g.id}`);
      Alert.alert(
        "✅ Group created!",
        "Share an invite link so friends can join?",
        [
          { text: "Later", style: "cancel" },
          { text: "🔗 Share link", onPress: () => shareInvite("group", g.name, g.inviteCode) },
        ]
      );
    } catch {
      Alert.alert("Error", "Could not create the group. Is the API running?");
    } finally {
      setBusy(false);
    }
  };

  const joinGroup = async () => {
    if (!joinCode.trim()) return;
    setBusy(true);
    try {
      const res = await api.post(`/groups/join/${joinCode.trim()}`);
      router.replace(`/group/${res.data.group.id}`);
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.error ?? "Invalid invite code");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>‹ Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>New Group</Text>

      <Text style={styles.label}>Group name</Text>
      <TextInput
        style={styles.input}
        placeholder="College Friends"
        placeholderTextColor="#475569"
        value={name}
        onChangeText={setName}
      />

      <Text style={styles.label}>Description (optional)</Text>
      <TextInput
        style={styles.input}
        placeholder="The best crew"
        placeholderTextColor="#475569"
        value={description}
        onChangeText={setDescription}
      />

      <TouchableOpacity
        style={[styles.button, (!name.trim() || busy) && styles.buttonDisabled]}
        onPress={createGroup}
        disabled={!name.trim() || busy}
      >
        <Text style={styles.buttonText}>{busy ? "..." : "Create Group"}</Text>
      </TouchableOpacity>

      <View style={styles.divider}>
        <View style={styles.line} />
        <Text style={styles.dividerText}>or join one</Text>
        <View style={styles.line} />
      </View>

      <Text style={styles.label}>Invite code</Text>
      <TextInput
        style={styles.input}
        placeholder="Paste invite code"
        placeholderTextColor="#475569"
        value={joinCode}
        onChangeText={setJoinCode}
        autoCapitalize="none"
      />
      <TouchableOpacity
        style={[styles.buttonOutline, (!joinCode.trim() || busy) && styles.buttonDisabled]}
        onPress={joinGroup}
        disabled={!joinCode.trim() || busy}
      >
        <Text style={styles.buttonOutlineText}>Join Group</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a", padding: 24, paddingTop: 60 },
  back: { marginBottom: 16 },
  backText: { color: "#6366f1", fontSize: 17 },
  title: { fontSize: 28, fontWeight: "800", color: "#ffffff", marginBottom: 24 },
  label: { color: "#cbd5e1", fontSize: 14, fontWeight: "600", marginBottom: 8 },
  input: {
    backgroundColor: "#1e293b", borderRadius: 14, padding: 16, color: "#ffffff",
    fontSize: 16, marginBottom: 16, borderWidth: 1, borderColor: "#334155",
  },
  button: { backgroundColor: "#6366f1", borderRadius: 16, padding: 18, alignItems: "center" },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#ffffff", fontSize: 17, fontWeight: "700" },
  divider: { flexDirection: "row", alignItems: "center", marginVertical: 28 },
  line: { flex: 1, height: 1, backgroundColor: "#1e293b" },
  dividerText: { color: "#475569", marginHorizontal: 12, fontSize: 14 },
  buttonOutline: {
    borderRadius: 16, padding: 18, alignItems: "center",
    borderWidth: 2, borderColor: "#6366f1",
  },
  buttonOutlineText: { color: "#6366f1", fontSize: 17, fontWeight: "700" },
});
