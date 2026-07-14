import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
import { shareInvite } from "../lib/invite";
import { colors, font, radius, shadow } from "../lib/theme";

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
        "Group created!",
        "Share an invite link so friends can join?",
        [
          { text: "Later", style: "cancel" },
          { text: "Share link", onPress: () => shareInvite("group", g.name, g.inviteCode) },
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
        <Ionicons name="chevron-back" size={18} color={colors.teal} />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>New Group</Text>

      <Text style={styles.label}>Group name</Text>
      <TextInput
        style={styles.input}
        placeholder="College Friends"
        placeholderTextColor={colors.faint}
        value={name}
        onChangeText={setName}
      />

      <Text style={styles.label}>Description (optional)</Text>
      <TextInput
        style={styles.input}
        placeholder="The best crew"
        placeholderTextColor={colors.faint}
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
        placeholderTextColor={colors.faint}
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
  container: { flex: 1, backgroundColor: colors.bg, padding: 20, paddingTop: 60 },
  back: { flexDirection: "row", alignItems: "center", gap: 2, marginBottom: 16 },
  backText: { color: colors.teal, fontSize: 15, fontFamily: font.bodySemi },
  title: { fontSize: 25, fontFamily: font.title, color: colors.ink, letterSpacing: -0.5, marginBottom: 24 },
  label: { color: colors.ink, fontSize: 13, fontFamily: font.bodySemi, marginBottom: 8 },
  input: {
    backgroundColor: colors.surface, borderRadius: radius.md, padding: 15, color: colors.ink,
    fontSize: 15, fontFamily: font.bodyMedium, marginBottom: 16, borderWidth: 1, borderColor: colors.line,
  },
  button: {
    backgroundColor: colors.orange, borderRadius: radius.lg, padding: 17,
    alignItems: "center", ...shadow.orange,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.onOrange, fontSize: 16, fontFamily: font.semi },
  divider: { flexDirection: "row", alignItems: "center", marginVertical: 28 },
  line: { flex: 1, height: 1, backgroundColor: colors.line },
  dividerText: { color: colors.faint, marginHorizontal: 12, fontSize: 13, fontFamily: font.bodyMedium },
  buttonOutline: {
    borderRadius: radius.lg, padding: 16, alignItems: "center",
    borderWidth: 1.5, borderColor: colors.teal, backgroundColor: colors.surface,
  },
  buttonOutlineText: { color: colors.teal, fontSize: 16, fontFamily: font.semi },
});
