import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView,
} from "react-native";
import { useAuthStore } from "../../hooks/useAuthStore";

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
          <Text style={styles.logo}>🗓️</Text>
          <Text style={styles.title}>PlanIt</Text>
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
                placeholderTextColor="#475569"
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
            placeholderTextColor="#475569"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder={mode === "register" ? "At least 8 characters" : "Your password"}
            placeholderTextColor="#475569"
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

          <Text style={styles.hint}>Google Sign-In coming with the app store release 🚀</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: "#0f172a", padding: 32, justifyContent: "center" },
  hero: { alignItems: "center", marginBottom: 36 },
  logo: { fontSize: 64, marginBottom: 12 },
  title: { fontSize: 44, fontWeight: "800", color: "#ffffff", letterSpacing: -1 },
  subtitle: { fontSize: 17, color: "#94a3b8", textAlign: "center", marginTop: 10, lineHeight: 24 },
  label: { color: "#cbd5e1", fontSize: 14, fontWeight: "600", marginBottom: 8 },
  input: {
    backgroundColor: "#1e293b", borderRadius: 14, padding: 16, color: "#ffffff",
    fontSize: 16, marginBottom: 16, borderWidth: 1, borderColor: "#334155",
  },
  error: { color: "#f87171", fontSize: 14, marginBottom: 12, textAlign: "center" },
  button: { backgroundColor: "#6366f1", borderRadius: 16, padding: 18, alignItems: "center", marginTop: 4 },
  buttonDisabled: { backgroundColor: "#312e81" },
  buttonText: { color: "#ffffff", fontSize: 17, fontWeight: "700" },
  switchBtn: { marginTop: 18, alignItems: "center" },
  switchText: { color: "#818cf8", fontSize: 15, fontWeight: "600" },
  hint: { color: "#475569", fontSize: 13, textAlign: "center", marginTop: 20 },
});
