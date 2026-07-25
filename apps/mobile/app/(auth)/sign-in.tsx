import { useEffect, useMemo, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Image,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { useAuthStore } from "../../hooks/useAuthStore";
import { useTheme, useT } from "../../hooks/useSettings";
import { GOOGLE } from "../../lib/oauth";
import { font, radius, shadow, Palette } from "../../lib/theme";

// Finishes the browser-based auth session when the app regains focus
WebBrowser.maybeCompleteAuthSession();

// Google Sign-In does NOT work inside Expo Go (SDK 53+ dropped the auth proxy).
// It only works in the native build. Detect Expo Go so we can explain instead
// of throwing Google's confusing "authorization error".
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export default function SignInScreen() {
  const { signIn, signUp, signInWithGoogle, loading, error, clearError } = useAuthStore();
  const c = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Google Sign-In (browser flow — works only in the native build, not Expo Go)
  const [gRequest, gResponse, gPromptAsync] = Google.useIdTokenAuthRequest({
    iosClientId: GOOGLE.iosClientId,
    androidClientId: GOOGLE.androidClientId,
    webClientId: GOOGLE.webClientId,
  });

  const onGooglePress = () => {
    if (isExpoGo) {
      Alert.alert(t("auth.googleExpoGoTitle"), t("auth.googleExpoGoMsg"));
      return;
    }
    clearError();
    gPromptAsync();
  };

  useEffect(() => {
    // Log the redirect URI once so it can be registered in Google Cloud
    if (gRequest?.redirectUri) console.log("Google redirect URI:", gRequest.redirectUri);
  }, [gRequest]);

  useEffect(() => {
    if (gResponse?.type === "success") {
      const idToken = gResponse.params?.id_token;
      if (idToken) signInWithGoogle(idToken);
    }
  }, [gResponse]);

  const emailOk = /\S+@\S+\.\S+/.test(email);
  const usernameOk = /^[a-z0-9_.]{3,20}$/.test(username);
  const canSubmit =
    emailOk &&
    password.length >= (mode === "register" ? 8 : 1) &&
    (mode === "login" || (name.trim().length > 0 && usernameOk));

  const submit = () => {
    if (mode === "login") signIn(email.trim(), password);
    else signUp(name.trim(), username, email.trim(), password);
  };

  const switchMode = () => {
    clearError();
    setMode((m) => (m === "login" ? "register" : "login"));
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Image source={require("../../assets/brand/icon.png")} style={styles.logo} />
          <Text style={styles.title}>
            Plan<Text style={{ color: c.orange }}>It</Text>
          </Text>
          <Text style={styles.subtitle}>{t("auth.subtitle")}</Text>
        </View>

        <View>
          {mode === "register" && (
            <>
              <Text style={styles.label}>{t("auth.yourName")}</Text>
              <TextInput
                style={styles.input}
                placeholder="Agustin"
                placeholderTextColor={c.faint}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />

              <Text style={styles.label}>{t("auth.username")}</Text>
              <TextInput
                style={styles.input}
                placeholder="agus"
                placeholderTextColor={c.faint}
                value={username}
                onChangeText={(v) => setUsername(v.toLowerCase().replace(/[^a-z0-9_.]/g, ""))}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.usernameHint}>
                {t("auth.usernameHint1")} {username || "agus"}#4821 {t("auth.usernameHint2")}
              </Text>
            </>
          )}

          <Text style={styles.label}>{t("auth.email")}</Text>
          <TextInput
            style={styles.input}
            placeholder="you@email.com"
            placeholderTextColor={c.faint}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <Text style={styles.label}>{t("auth.password")}</Text>
          <TextInput
            style={styles.input}
            placeholder={mode === "register" ? t("auth.pwPlaceholderNew") : t("auth.pwPlaceholder")}
            placeholderTextColor={c.faint}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.button, (!canSubmit || loading) && styles.buttonDisabled]}
            onPress={submit}
            disabled={!canSubmit || loading}
          >
            <Text style={styles.buttonText}>
              {loading ? "..." : mode === "login" ? t("auth.logIn") : t("auth.createAccount")}
            </Text>
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>{t("auth.or")}</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={styles.googleBtn}
            onPress={onGooglePress}
            disabled={(!gRequest && !isExpoGo) || loading}
          >
            <Ionicons name="logo-google" size={18} color={c.ink} />
            <Text style={styles.googleText}>{t("auth.google")}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={switchMode} style={styles.switchBtn}>
            <Text style={styles.switchText}>
              {mode === "login" ? t("auth.switchToRegister") : t("auth.switchToLogin")}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: c.bg, padding: 32, justifyContent: "center" },
  hero: { alignItems: "center", marginBottom: 36 },
  logo: { width: 84, height: 84, borderRadius: 22, marginBottom: 16, ...shadow.orange },
  title: { fontSize: 40, fontFamily: font.title, color: c.ink, letterSpacing: -1 },
  subtitle: {
    fontSize: 15, fontFamily: font.bodyMedium, color: c.muted,
    textAlign: "center", marginTop: 10, lineHeight: 23,
  },
  label: { color: c.ink, fontSize: 13, fontFamily: font.bodySemi, marginBottom: 8 },
  usernameHint: {
    color: c.faint, fontSize: 12, fontFamily: font.body,
    marginTop: -10, marginBottom: 16,
  },
  input: {
    backgroundColor: c.surface, borderRadius: radius.md, padding: 16, color: c.ink,
    fontSize: 15, fontFamily: font.bodyMedium, marginBottom: 16, borderWidth: 1, borderColor: c.line,
  },
  error: { color: c.danger, fontSize: 13, fontFamily: font.bodyMedium, marginBottom: 12, textAlign: "center" },
  button: {
    backgroundColor: c.orange, borderRadius: radius.lg, padding: 17,
    alignItems: "center", marginTop: 4, ...shadow.orange,
  },
  buttonDisabled: { backgroundColor: "#F7BF87", shadowOpacity: 0 },
  buttonText: { color: c.onOrange, fontSize: 16, fontFamily: font.semi },
  switchBtn: { marginTop: 18, alignItems: "center" },
  switchText: { color: c.teal, fontSize: 14, fontFamily: font.bodySemi },
  hint: { color: c.faint, fontSize: 12.5, fontFamily: font.body, textAlign: "center", marginTop: 20 },
  dividerRow: { flexDirection: "row", alignItems: "center", marginTop: 18, marginBottom: 4 },
  dividerLine: { flex: 1, height: 1, backgroundColor: c.line },
  dividerText: { color: c.faint, fontSize: 12, fontFamily: font.bodyMedium, marginHorizontal: 12 },
  googleBtn: {
    flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 9,
    backgroundColor: c.surface, borderRadius: radius.lg, padding: 15, marginTop: 12,
    borderWidth: 1, borderColor: c.line,
  },
  googleText: { color: c.ink, fontSize: 15, fontFamily: font.semi },
});
