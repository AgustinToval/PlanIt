import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  Alert, Image, ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
import { compressToDataUrl } from "../lib/images";
import { useAuthStore } from "../hooks/useAuthStore";
import { font, radius, shadow, Palette, themedStyles } from "../lib/theme";
import { useTheme, useT } from "../hooks/useSettings";

export default function EditProfileScreen() {
  const c = useTheme();
  const styles = getStyles(c);
  const t = useT();
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

  const applyPicked = async (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled || !result.assets?.[0]?.uri) return;
    try {
      // resize + JPEG re-encode: avatars end up ~30-80 KB
      const dataUrl = await compressToDataUrl(result.assets[0].uri, 512, 0.6);
      setAvatar(dataUrl);
    } catch {
      Alert.alert("Error", "Could not process that image.");
    }
  };

  const pickFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t("er.permission"), t("er.photoPerm"));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
    });
    await applyPicked(result);
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t("er.permission"), t("er.cameraPerm"));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
    });
    await applyPicked(result);
  };

  const pickAvatar = () => {
    Alert.alert(t("ep.photoQ"), t("ep.photoHow"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("ep.takePhoto"), onPress: takePhoto },
      { text: t("ep.fromGallery"), onPress: pickFromLibrary },
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
      Alert.alert(t("ep.saved"), t("ep.savedMsg"));
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
      Alert.alert(t("ep.pwChanged"));
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
        <Ionicons name="chevron-back" size={18} color={c.teal} />
        <Text style={styles.backText}>{t("common.back")}</Text>
      </TouchableOpacity>

      <Text style={styles.title}>{t("scr.editProfile")}</Text>

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
          <Ionicons name="camera-outline" size={14} color={c.teal} />
          <Text style={styles.avatarHint}>{t("ep.tapPhoto")}</Text>
        </View>
      </TouchableOpacity>

      <Text style={styles.label}>{t("ep.name")}</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName}
        placeholder={t("auth.yourName")} placeholderTextColor={c.faint} />

      <Text style={styles.label}>{t("auth.username")}</Text>
      <TextInput style={styles.input} value={username} onChangeText={(t) => setUsername(t.toLowerCase().replace(/[^a-z0-9_\.]/g, ""))}
        placeholder="username" placeholderTextColor={c.faint} autoCapitalize="none" />

      <Text style={styles.label}>{t("ep.bio")}</Text>
      <TextInput style={[styles.input, { height: 70 }]} value={bio} onChangeText={setBio}
        placeholder={t("ep.bioPh")} placeholderTextColor={c.faint} multiline textAlignVertical="top" />

      <Text style={styles.label}>{t("fr.location")}</Text>
      <TextInput style={styles.input} value={location} onChangeText={setLocation}
        placeholder="Buenos Aires" placeholderTextColor={c.faint} />

      <TouchableOpacity style={[styles.button, saving && { opacity: 0.5 }]} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t("common.saveChanges")}</Text>}
      </TouchableOpacity>

      {/* Change password */}
      <View style={styles.divider} />
      <View style={styles.sectionTitleRow}>
        <Ionicons name="lock-closed-outline" size={16} color={c.ink} />
        <Text style={styles.sectionTitle}>{t("ep.changePw")}</Text>
      </View>

      <Text style={styles.label}>{t("ep.currentPw")}</Text>
      <TextInput style={styles.input} value={currentPw} onChangeText={setCurrentPw}
        placeholder={t("ep.currentPwPh")} placeholderTextColor={c.faint} secureTextEntry autoCapitalize="none" />

      <Text style={styles.label}>{t("ep.newPw")}</Text>
      <TextInput style={styles.input} value={newPw} onChangeText={setNewPw}
        placeholder={t("auth.pwPlaceholderNew")} placeholderTextColor={c.faint} secureTextEntry autoCapitalize="none" />

      <TouchableOpacity
        style={[styles.buttonOutline, (!currentPw || newPw.length < 8 || changingPw) && { opacity: 0.5 }]}
        onPress={changePassword}
        disabled={!currentPw || newPw.length < 8 || changingPw}
      >
        <Text style={styles.buttonOutlineText}>{changingPw ? "..." : t("ep.changePw")}</Text>
      </TouchableOpacity>

      <View style={{ height: 60 }} />
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const getStyles = themedStyles((c: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg, padding: 20, paddingTop: 60 },
  back: { flexDirection: "row", alignItems: "center", gap: 2, marginBottom: 16 },
  backText: { color: c.teal, fontSize: 15, fontFamily: font.bodySemi },
  title: { fontSize: 25, fontFamily: font.title, color: c.ink, letterSpacing: -0.5, marginBottom: 20 },
  avatarWrap: { alignItems: "center", marginBottom: 24 },
  avatar: { width: 110, height: 110, borderRadius: 55 },
  avatarPlaceholder: {
    backgroundColor: c.orange, alignItems: "center", justifyContent: "center", ...shadow.orange,
  },
  avatarLetter: { color: "#fff", fontSize: 42, fontFamily: font.title },
  avatarHintRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 10 },
  avatarHint: { color: c.teal, fontSize: 12.5, fontFamily: font.bodySemi },
  label: { color: c.ink, fontSize: 13, fontFamily: font.bodySemi, marginBottom: 8 },
  input: {
    backgroundColor: c.surface, borderRadius: radius.md, padding: 14, color: c.ink,
    fontSize: 14.5, fontFamily: font.bodyMedium, marginBottom: 16, borderWidth: 1, borderColor: c.line,
  },
  button: {
    backgroundColor: c.orange, borderRadius: radius.lg, padding: 16,
    alignItems: "center", marginTop: 4, ...shadow.orange,
  },
  buttonText: { color: c.onOrange, fontSize: 15, fontFamily: font.semi },
  divider: { height: 1, backgroundColor: c.line, marginVertical: 28 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 16 },
  sectionTitle: { color: c.ink, fontSize: 17, fontFamily: font.semi, letterSpacing: -0.2 },
  buttonOutline: {
    borderRadius: radius.lg, padding: 15, alignItems: "center",
    borderWidth: 1.5, borderColor: c.teal, backgroundColor: c.surface,
  },
  buttonOutlineText: { color: c.teal, fontSize: 15, fontFamily: font.semi },
}));
