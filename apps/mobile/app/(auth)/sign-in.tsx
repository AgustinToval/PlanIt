import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Image,
  KeyboardAvoidingView, Platform, ScrollView,
} from "react-native";
import { useAuthStore } from "../../hooks/useAuthStore";
import { colors, font, radius, shadow } from "../../lib/theme";

export default function SignInScreen() {
  const { signIn, signUp, loading, error, clearError } = useAuthStore();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const emailOk = /\S+@\S+\.\S+/.test(email);
  const canSubmit =
    emailOk &&
    password.length >= (mode === "register" ? 8 : 1) &&
    (mode === "login" || name.trim().length > 0);

  const submit = () => {
    if (mode === "login") signIn(email.trim(), password);
    else signUp(name.trim(), email.trim(), password);
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
            Plan<Text style={{ color: colors.orange }}>It</Text>
          </Text>
          <Text style={styles.subtitle}>
            Plan anything with your people.{"\n"}All in one place.
          </Text>
        </View>

        <View>
          {mode === "register" && (
            <>
              <Text style={styles.label}>Your name</Text>
              <TextInput
                style={styles.input}
                placeholder="Agustin"
                placeholderTextColor={colors.faint}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            </>
          )}

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@email.com"
            placeholderTextColor={colors.faint}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder={mode === "register" ? "At least 8 characters" : "Your password"}
            placeholderTextColor={colors.faint}
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
              {loading ? "..." : mode === "login" ? "Log In" : "Create Account"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={switchMode} style={styles.switchBtn}>
            <Text style={styles.switchText}>
              {mode === "login"
                ? "New here? Create an account"
                : "Already have an account? Log in"}
            </Text>
          </TouchableOpacity>

          <Text style={styles.hint}>Google Sign-In coming with the app store release</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: colors.bg, padding: 32, justifyContent: "center" },
  hero: { alignItems: "center", marginBottom: 36 },
  logo: { width: 84, height: 84, borderRadius: 22, marginBottom: 16, ...shadow.orange },
  title: { fontSize: 40, fontFamily: font.title, color: colors.ink, letterSpacing: -1 },
  subtitle: {
    fontSize: 15, fontFamily: font.bodyMedium, color: colors.muted,
    textAlign: "center", marginTop: 10, lineHeight: 23,
  },
  label: { color: colors.ink, fontSize: 13, fontFamily: font.bodySemi, marginBottom: 8 },
  input: {
    backgroundColor: colors.surface, borderRadius: radius.md, padding: 16, color: colors.ink,
    fontSize: 15, fontFamily: font.bodyMedium, marginBottom: 16, borderWidth: 1, borderColor: colors.line,
  },
  error: { color: colors.danger, fontSize: 13, fontFamily: font.bodyMedium, marginBottom: 12, textAlign: "center" },
  button: {
    backgroundColor: colors.orange, borderRadius: radius.lg, padding: 17,
    alignItems: "center", marginTop: 4, ...shadow.orange,
  },
  buttonDisabled: { backgroundColor: "#F7BF87", shadowOpacity: 0 },
  buttonText: { color: colors.onOrange, fontSize: 16, fontFamily: font.semi },
  switchBtn: { marginTop: 18, alignItems: "center" },
  switchText: { color: colors.teal, fontSize: 14, fontFamily: font.bodySemi },
  hint: { color: colors.faint, fontSize: 12.5, fontFamily: font.body, textAlign: "center", marginTop: 20 },
});
