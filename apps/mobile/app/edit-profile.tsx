import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  Alert, Image, ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
import { useAuthStore } from "../hooks/useAuthStore";
import { colors, font, radius, shadow } from "../lib/theme";

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

  const applyPicked = (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled || !result.assets?.[0]?.base64) return;
    const asset = result.assets[0];
    const dataUrl = `data:${asset.mimeType ?? "image/jpeg"};base64,${asset.base64}`;
    if (dataUrl.length > 2_000_000) {
      Alert.alert("Too large", "That image is too big — try a smaller one.");
      return;
    }
    setAvatar(dataUrl);
  };

  const pickFromLibrary = async () => {
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
    applyPicked(result);
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow camera access to take a profile picture.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.4,
      base64: true,
      allowsEditing: true,
      aspect: [1, 1],
    });
    applyPicked(result);
  };

  const pickAvatar = () => {
    Alert.alert("Profile photo", "How do you want to add it?", [
      { text: "Cancel", style: "cancel" },
      { text: "Take a photo", onPress: takePhoto },
      { text: "Choose from gallery", onPress: pickFromLibrary },
    ]);
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
      Alert.alert("Saved", "Your profile was updated.");
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
      Alert.alert("Password changed");
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
        <Ionicons name="chevron-back" size={18} color={colors.teal} />
        <Text style={styles.backText}>Back</Text>
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
        <View style={styles.avatarHintRow}>
          <Ionicons name="camera-outline" size={14} color={colors.teal} />
          <Text style={styles.avatarHint}>Tap to change photo</Text>
        </View>
      </TouchableOpacity>

      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName}
        placeholder="Your name" placeholderTextColor={colors.faint} />

      <Text style={styles.label}>Username</Text>
      <TextInput style={styles.input} value={username} onChangeText={(t) => setUsername(t.toLowerCase().replace(/[^a-z0-9_\.]/g, ""))}
        placeholder="username" placeholderTextColor={colors.faint} autoCapitalize="none" />

      <Text style={styles.label}>Bio</Text>
      <TextInput style={[styles.input, { height: 70 }]} value={bio} onChangeText={setBio}
        placeholder="Something about you" placeholderTextColor={colors.faint} multiline textAlignVertical="top" />

      <Text style={styles.label}>Location</Text>
      <TextInput style={styles.input} value={location} onChangeText={setLocation}
        placeholder="Buenos Aires" placeholderTextColor={colors.faint} />

      <TouchableOpacity style={[styles.button, saving && { opacity: 0.5 }]} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save changes</Text>}
      </TouchableOpacity>

      {/* Change password */}
      <View style={styles.divider} />
      <View style={styles.sectionTitleRow}>
        <Ionicons name="lock-closed-outline" size={16} color={colors.ink} />
        <Text style={styles.sectionTitle}>Change password</Text>
      </View>

      <Text style={styles.label}>Current password</Text>
      <TextInput style={styles.input} value={currentPw} onChangeText={setCurrentPw}
        placeholder="Your current password" placeholderTextColor={colors.faint} secureTextEntry autoCapitalize="none" />

      <Text style={styles.label}>New password</Text>
      <TextInput style={styles.input} value={newPw} onChangeText={setNewPw}
        placeholder="At least 8 characters" placeholderTextColor={colors.faint} secureTextEntry autoCapitalize="none" />

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
  container: { flex: 1, backgroundColor: colors.bg, padding: 20, paddingTop: 60 },
  back: { flexDirection: "row", alignItems: "center", gap: 2, marginBottom: 16 },
  backText: { color: colors.teal, fontSize: 15, fontFamily: font.bodySemi },
  title: { fontSize: 25, fontFamily: font.title, color: colors.ink, letterSpacing: -0.5, marginBottom: 20 },
  avatarWrap: { alignItems: "center", marginBottom: 24 },
  avatar: { width: 110, height: 110, borderRadius: 55 },
  avatarPlaceholder: {
    backgroundColor: colors.orange, alignItems: "center", justifyContent: "center", ...shadow.orange,
  },
  avatarLetter: { color: "#fff", fontSize: 42, fontFamily: font.title },
  avatarHintRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 10 },
  avatarHint: { color: colors.teal, fontSize: 12.5, fontFamily: font.bodySemi },
  label: { color: colors.ink, fontSize: 13, fontFamily: font.bodySemi, marginBottom: 8 },
  input: {
    backgroundColor: colors.surface, borderRadius: radius.md, padding: 14, color: colors.ink,
    fontSize: 14.5, fontFamily: font.bodyMedium, marginBottom: 16, borderWidth: 1, borderColor: colors.line,
  },
  button: {
    backgroundColor: colors.orange, borderRadius: radius.lg, padding: 16,
    alignItems: "center", marginTop: 4, ...shadow.orange,
  },
  buttonText: { color: colors.onOrange, fontSize: 15, fontFamily: font.semi },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 28 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 16 },
  sectionTitle: { color: colors.ink, fontSize: 17, fontFamily: font.semi, letterSpacing: -0.2 },
  buttonOutline: {
    borderRadius: radius.lg, padding: 15, alignItems: "center",
    borderWidth: 1.5, borderColor: colors.teal, backgroundColor: colors.surface,
  },
  buttonOutlineText: { color: colors.teal, fontSize: 15, fontFamily: font.semi },
});
