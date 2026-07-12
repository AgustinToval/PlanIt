import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  Alert, Image, ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { api } from "../lib/api";
import { useAuthStore } from "../hooks/useAuthStore";

export default function EditProfileScreen() {
  const router = useRouter();
  const { user, setUser } = useAuthStore();

  const [name, setName] = useState(user?.name ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [location, setLocation] = useState(user?.location ?? "");
  const [avatar, setAvatar] = useState<string | null>(user?.avatar ?? null);
  const [saving, setSaving] = useState(false);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [changingPw, setChangingPw] = useState(false);

  const pickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo access to set a profile picture.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.4,
      base64: true,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets?.[0]?.base64) return;
    const asset = result.assets[0];
    const dataUrl = `data:${asset.mimeType ?? "image/jpeg"};base64,${asset.base64}`;
    if (dataUrl.length > 2_000_000) {
      Alert.alert("Too large", "That image is too big — try a smaller one.");
      return;
    }
    setAvatar(dataUrl);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.patch("/users/me", {
        name: name.trim() || undefined,
        username: username.trim() || undefined,
        bio: bio.trim() || undefined,
        location: location.trim() || undefined,
        avatar: avatar ?? undefined,
      });
      setUser(res.data);
      Alert.alert("✅ Saved", "Your profile was updated.");
      router.back();
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.error ?? "Could not save profile");
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (!currentPw || newPw.length < 8) return;
    setChangingPw(true);
    try {
      await api.post("/users/me/password", { current: currentPw, next: newPw });
      setCurrentPw("");
      setNewPw("");
      Alert.alert("✅ Password changed");
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.error ?? "Could not change password");
    } finally {
      setChangingPw(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <TouchableOpacity onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>‹ Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Edit Profile</Text>

      {/* Avatar */}
      <TouchableOpacity style={styles.avatarWrap} onPress={pickAvatar}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarLetter}>{(name || "?")[0]?.toUpperCase()}</Text>
          </View>
        )}
        <Text style={styles.avatarHint}>📷 Tap to change photo</Text>
      </TouchableOpacity>

      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName}
        placeholder="Your name" placeholderTextColor="#475569" />

      <Text style={styles.label}>Username</Text>
      <TextInput style={styles.input} value={username} onChangeText={(t) => setUsername(t.toLowerCase().replace(/[^a-z0-9_\.]/g, ""))}
        placeholder="username" placeholderTextColor="#475569" autoCapitalize="none" />

      <Text style={styles.label}>Bio</Text>
      <TextInput style={[styles.input, { height: 70 }]} value={bio} onChangeText={setBio}
        placeholder="Something about you" placeholderTextColor="#475569" multiline textAlignVertical="top" />

      <Text style={styles.label}>Location</Text>
      <TextInput style={styles.input} value={location} onChangeText={setLocation}
        placeholder="Buenos Aires" placeholderTextColor="#475569" />

      <TouchableOpacity style={[styles.button, saving && { opacity: 0.5 }]} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save changes</Text>}
      </TouchableOpacity>

      {/* Change password */}
      <View style={styles.divider} />
      <Text style={styles.sectionTitle}>🔒 Change password</Text>

      <Text style={styles.label}>Current password</Text>
      <TextInput style={styles.input} value={currentPw} onChangeText={setCurrentPw}
        placeholder="Your current password" placeholderTextColor="#475569" secureTextEntry autoCapitalize="none" />

      <Text style={styles.label}>New password</Text>
      <TextInput style={styles.input} value={newPw} onChangeText={setNewPw}
        placeholder="At least 8 characters" placeholderTextColor="#475569" secureTextEntry autoCapitalize="none" />

      <TouchableOpacity
        style={[styles.buttonOutline, (!currentPw || newPw.length < 8 || changingPw) && { opacity: 0.5 }]}
        onPress={changePassword}
        disabled={!currentPw || newPw.length < 8 || changingPw}
      >
        <Text style={styles.buttonOutlineText}>{changingPw ? "..." : "Change password"}</Text>
      </TouchableOpacity>

      <View style={{ height: 60 }} />
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a", padding: 24, paddingTop: 60 },
  back: { marginBottom: 16 },
  backText: { color: "#6366f1", fontSize: 17 },
  title: { fontSize: 28, fontWeight: "800", color: "#ffffff", marginBottom: 20 },
  avatarWrap: { alignItems: "center", marginBottom: 24 },
  avatar: { width: 110, height: 110, borderRadius: 55 },
  avatarPlaceholder: { backgroundColor: "#6366f1", alignItems: "center", justifyContent: "center" },
  avatarLetter: { color: "#ffffff", fontSize: 44, fontWeight: "800" },
  avatarHint: { color: "#818cf8", fontSize: 13, marginTop: 10, fontWeight: "600" },
  label: { color: "#cbd5e1", fontSize: 14, fontWeight: "600", marginBottom: 8 },
  input: {
    backgroundColor: "#1e293b", borderRadius: 14, padding: 14, color: "#ffffff",
    fontSize: 15, marginBottom: 16, borderWidth: 1, borderColor: "#334155",
  },
  button: { backgroundColor: "#6366f1", borderRadius: 16, padding: 16, alignItems: "center", marginTop: 4 },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  divider: { height: 1, backgroundColor: "#1e293b", marginVertical: 28 },
  sectionTitle: { color: "#ffffff", fontSize: 18, fontWeight: "800", marginBottom: 16 },
  buttonOutline: { borderRadius: 16, padding: 16, alignItems: "center", borderWidth: 2, borderColor: "#6366f1" },
  buttonOutlineText: { color: "#6366f1", fontSize: 16, fontWeight: "700" },
});
