import { View, Text, TouchableOpacity, StyleSheet, Image } from "react-native";
import { useAuthStore } from "../../hooks/useAuthStore";

export default function LoginScreen() {
  const { signInWithGoogle, loading } = useAuthStore();

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.logo}>🗓️</Text>
        <Text style={styles.title}>PlanIt</Text>
        <Text style={styles.subtitle}>
          Plan anything with your people.{"\n"}All in one place.
        </Text>
      </View>

      <View style={styles.features}>
        {["💸 Split expenses instantly", "📋 Organize activities", "🎙️ Walkie talkie on the go", "🎵 Shared playlists"].map((f) => (
          <Text key={f} style={styles.feature}>{f}</Text>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={signInWithGoogle}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? "Signing in..." : "Continue with Google"}
        </Text>
      </TouchableOpacity>

      <Text style={styles.terms}>
        By continuing you agree to our Terms of Service and Privacy Policy
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a", padding: 32, justifyContent: "space-between" },
  hero: { flex: 1, alignItems: "center", justifyContent: "center" },
  logo: { fontSize: 72, marginBottom: 16 },
  title: { fontSize: 48, fontWeight: "800", color: "#ffffff", letterSpacing: -1 },
  subtitle: { fontSize: 18, color: "#94a3b8", textAlign: "center", marginTop: 12, lineHeight: 26 },
  features: { marginBottom: 32 },
  feature: { color: "#cbd5e1", fontSize: 16, marginBottom: 10, paddingLeft: 8 },
  button: { backgroundColor: "#6366f1", borderRadius: 16, padding: 18, alignItems: "center" },
  buttonDisabled: { backgroundColor: "#4338ca" },
  buttonText: { color: "#ffffff", fontSize: 17, fontWeight: "700" },
  terms: { color: "#475569", fontSize: 12, textAlign: "center", marginTop: 16 },
});
