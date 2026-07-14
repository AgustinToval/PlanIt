import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../../lib/api";
import { useAuthStore } from "../../../hooks/useAuthStore";
import { colors, font, radius, shadow } from "../../../lib/theme";

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
          <ActivityIndicator size="large" color={colors.orange} />
          <Text style={styles.text}>Joining {kind === "group" ? "group" : "plan"}...</Text>
        </>
      )}
      {status === "done" && (
        <>
          <View style={[styles.iconWrap, { backgroundColor: colors.tealSoft }]}>
            <Ionicons name="checkmark-circle" size={44} color={colors.teal} />
          </View>
          <Text style={styles.text}>You're in! Opening it...</Text>
        </>
      )}
      {status === "needLogin" && (
        <>
          <View style={[styles.iconWrap, { backgroundColor: colors.orangeSoft }]}>
            <Ionicons name="hand-left-outline" size={40} color={colors.orange} />
          </View>
          <Text style={styles.title}>Log in to join</Text>
          <Text style={styles.sub}>Create an account or log in, then open this link again.</Text>
          <TouchableOpacity style={styles.btn} onPress={() => router.replace("/(auth)/sign-in")}>
            <Text style={styles.btnText}>Log in / Sign up</Text>
          </TouchableOpacity>
        </>
      )}
      {status === "error" && (
        <>
          <View style={[styles.iconWrap, { backgroundColor: colors.dangerSoft }]}>
            <Ionicons name="alert-circle-outline" size={44} color={colors.danger} />
          </View>
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
  container: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", padding: 32 },
  iconWrap: {
    width: 88, height: 88, borderRadius: 28,
    alignItems: "center", justifyContent: "center", marginBottom: 16,
  },
  title: { color: colors.ink, fontSize: 21, fontFamily: font.title, textAlign: "center", letterSpacing: -0.3 },
  sub: { color: colors.muted, fontSize: 14, fontFamily: font.bodyMedium, textAlign: "center", marginTop: 10 },
  text: { color: colors.ink, fontSize: 15, fontFamily: font.bodySemi, marginTop: 16 },
  btn: {
    marginTop: 24, backgroundColor: colors.orange, borderRadius: radius.md,
    paddingHorizontal: 28, paddingVertical: 14, ...shadow.orange,
  },
  btnText: { color: colors.onOrange, fontSize: 15, fontFamily: font.semi },
});
