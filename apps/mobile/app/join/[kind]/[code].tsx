import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "../../../lib/api";
import { useAuthStore } from "../../../hooks/useAuthStore";

// Handles deep links like planit://join/plan/<code> and planit://join/group/<code>
export default function JoinScreen() {
  const { kind, code } = useLocalSearchParams<{ kind: string; code: string }>();
  const router = useRouter();
  const { token } = useAuthStore();
  const [status, setStatus] = useState<"joining" | "done" | "error" | "needLogin">("joining");
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      if (!token) {
        setStatus("needLogin");
        return;
      }
      const type = kind === "group" ? "group" : "plan";
      try {
        const res = await api.post(`/${type}s/join/${code}`);
        setStatus("done");
        const id = type === "group" ? res.data.group?.id : res.data.plan?.id;
        setTimeout(() => {
          if (id) router.replace(`/${type}/${id}`);
          else router.replace("/(tabs)");
        }, 900);
      } catch (e: any) {
        setStatus("error");
        setMessage(e?.response?.data?.error ?? "Could not join with this link");
      }
    })();
  }, [kind, code, token]);

  return (
    <View style={styles.container}>
      {status === "joining" && (
        <>
          <ActivityIndicator size="large" color="#6366f1" />
          <Text style={styles.text}>Joining {kind === "group" ? "group" : "plan"}...</Text>
        </>
      )}
      {status === "done" && (
        <>
          <Text style={styles.emoji}>🎉</Text>
          <Text style={styles.text}>You're in! Opening it...</Text>
        </>
      )}
      {status === "needLogin" && (
        <>
          <Text style={styles.emoji}>👋</Text>
          <Text style={styles.title}>Log in to join</Text>
          <Text style={styles.sub}>Create an account or log in, then open this link again.</Text>
          <TouchableOpacity style={styles.btn} onPress={() => router.replace("/(auth)/sign-in")}>
            <Text style={styles.btnText}>Log in / Sign up</Text>
          </TouchableOpacity>
        </>
      )}
      {status === "error" && (
        <>
          <Text style={styles.emoji}>😕</Text>
          <Text style={styles.title}>{message}</Text>
          <TouchableOpacity style={styles.btn} onPress={() => router.replace("/(tabs)")}>
            <Text style={styles.btnText}>Go home</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a", alignItems: "center", justifyContent: "center", padding: 32 },
  emoji: { fontSize: 56, marginBottom: 16 },
  title: { color: "#ffffff", fontSize: 22, fontWeight: "800", textAlign: "center" },
  sub: { color: "#94a3b8", fontSize: 15, textAlign: "center", marginTop: 10 },
  text: { color: "#cbd5e1", fontSize: 16, marginTop: 16 },
  btn: { marginTop: 24, backgroundColor: "#6366f1", borderRadius: 14, paddingHorizontal: 28, paddingVertical: 14 },
  btnText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
});
