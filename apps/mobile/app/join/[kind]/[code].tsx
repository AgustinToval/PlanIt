import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../../lib/api";
import { useAuthStore } from "../../../hooks/useAuthStore";
import { font, radius, shadow, Palette, themedStyles } from "../../../lib/theme";
import { useTheme } from "../../../hooks/useSettings";

// Handles deep links like planit://join/plan/<code> and planit://join/group/<code>
export default function JoinScreen() {
  const c = useTheme();
  const styles = getStyles(c);
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
          <ActivityIndicator size="large" color={c.orange} />
          <Text style={styles.text}>Joining {kind === "group" ? "group" : "plan"}...</Text>
        </>
      )}
      {status === "done" && (
        <>
          <View style={[styles.iconWrap, { backgroundColor: c.tealSoft }]}>
            <Ionicons name="checkmark-circle" size={44} color={c.teal} />
          </View>
          <Text style={styles.text}>You're in! Opening it...</Text>
        </>
      )}
      {status === "needLogin" && (
        <>
          <View style={[styles.iconWrap, { backgroundColor: c.orangeSoft }]}>
            <Ionicons name="hand-left-outline" size={40} color={c.orange} />
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
          <View style={[styles.iconWrap, { backgroundColor: c.dangerSoft }]}>
            <Ionicons name="alert-circle-outline" size={44} color={c.danger} />
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

const getStyles = themedStyles((c: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center", padding: 32 },
  iconWrap: {
    width: 88, height: 88, borderRadius: 28,
    alignItems: "center", justifyContent: "center", marginBottom: 16,
  },
  title: { color: c.ink, fontSize: 21, fontFamily: font.title, textAlign: "center", letterSpacing: -0.3 },
  sub: { color: c.muted, fontSize: 14, fontFamily: font.bodyMedium, textAlign: "center", marginTop: 10 },
  text: { color: c.ink, fontSize: 15, fontFamily: font.bodySemi, marginTop: 16 },
  btn: {
    marginTop: 24, backgroundColor: c.orange, borderRadius: radius.md,
    paddingHorizontal: 28, paddingVertical: 14, ...shadow.orange,
  },
  btnText: { color: c.onOrange, fontSize: 15, fontFamily: font.semi },
}));
