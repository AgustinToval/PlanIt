import { useEffect, useRef, useState } from "react";
import { View, Text, Image, Animated, StyleSheet, TouchableOpacity } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as LocalAuthentication from "expo-local-authentication";
import { Ionicons } from "@expo/vector-icons";
import { useFonts, Poppins_600SemiBold, Poppins_700Bold } from "@expo-google-fonts/poppins";
import {
  Montserrat_400Regular, Montserrat_500Medium, Montserrat_600SemiBold, Montserrat_700Bold,
} from "@expo-google-fonts/montserrat";
import { useAuthStore } from "../hooks/useAuthStore";
import { useSettings, useTheme, useT } from "../hooks/useSettings";
import { registerForPush } from "../lib/notifications";
import { colors, font, radius, shadow } from "../lib/theme";

// Branded splash: petrol background, pulsing P-pin logo, then fades out.
function Splash({ onDone }: { onDone: () => void }) {
  const pulse = useRef(new Animated.Value(1)).current;
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 650, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
      ])
    );
    loop.start();
    const t = setTimeout(() => {
      Animated.timing(fade, { toValue: 0, duration: 350, useNativeDriver: true }).start(() => onDone());
    }, 1400);
    return () => { loop.stop(); clearTimeout(t); };
  }, []);

  return (
    <Animated.View style={[styles.splash, { opacity: fade }]}>
      <Animated.View style={{ transform: [{ scale: pulse }] }}>
        <Image source={require("../assets/brand/icon.png")} style={styles.splashLogo} />
      </Animated.View>
      <Text style={styles.splashWord}>
        Plan<Text style={{ color: colors.orange }}>It</Text>
      </Text>
    </Animated.View>
  );
}

// Biometric gate: shown when the user enabled Face ID / fingerprint lock
function BiometricLock({ onUnlock }: { onUnlock: () => void }) {
  const t = useT();
  const [failed, setFailed] = useState(false);

  const tryUnlock = async () => {
    setFailed(false);
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !enrolled) {
        // No biometrics available on this device — don't lock the user out
        onUnlock();
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "PlanIt",
      });
      if (result.success) onUnlock();
      else setFailed(true);
    } catch {
      setFailed(true);
    }
  };

  useEffect(() => { tryUnlock(); }, []);

  return (
    <View style={styles.splash}>
      <Image source={require("../assets/brand/icon.png")} style={styles.splashLogo} />
      <TouchableOpacity style={styles.unlockBtn} onPress={tryUnlock}>
        <Ionicons name="lock-open-outline" size={17} color="#fff" />
        <Text style={styles.unlockText}>{t("bio.unlock")}</Text>
      </TouchableOpacity>
      {failed && <Text style={styles.unlockHint}>{t("bio.failed")}</Text>}
    </View>
  );
}

export default function RootLayout() {
  const { token, loadToken } = useAuthStore();
  const { loaded: settingsLoaded, load: loadSettings, theme, biometric } = useSettings();
  const c = useTheme();
  const [splashDone, setSplashDone] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [fontsLoaded] = useFonts({
    Poppins_600SemiBold, Poppins_700Bold,
    Montserrat_400Regular, Montserrat_500Medium, Montserrat_600SemiBold, Montserrat_700Bold,
  });

  useEffect(() => {
    loadToken();
    loadSettings();
  }, []);

  // Register the device for push notifications once signed in
  useEffect(() => {
    if (token) registerForPush();
  }, [token]);

  if (!fontsLoaded || !splashDone || !settingsLoaded) {
    return (
      <>
        <StatusBar style="light" />
        {fontsLoaded ? (
          <Splash onDone={() => setSplashDone(true)} />
        ) : (
          <View style={styles.splash} />
        )}
      </>
    );
  }

  // Face ID / fingerprint gate (only when enabled and signed in)
  if (token && biometric && !unlocked) {
    return (
      <>
        <StatusBar style="light" />
        <BiometricLock onUnlock={() => setUnlocked(true)} />
      </>
    );
  }

  return (
    <>
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Protected guard={!!token}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="group/[id]" />
          <Stack.Screen name="plan/[id]" />
          <Stack.Screen name="create-group" />
          <Stack.Screen name="create-plan" />
          <Stack.Screen name="friends" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="edit-profile" />
          <Stack.Screen name="templates" />
          <Stack.Screen name="join/[kind]/[code]" />
        </Stack.Protected>

        <Stack.Protected guard={!token}>
          <Stack.Screen name="(auth)/sign-in" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: colors.petrol, alignItems: "center", justifyContent: "center", gap: 20 },
  splashLogo: { width: 104, height: 104, borderRadius: 26 },
  splashWord: { fontFamily: font.title, fontSize: 34, color: "#FFFFFF", letterSpacing: -0.5 },
  unlockBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: colors.orange, borderRadius: radius.md,
    paddingHorizontal: 26, paddingVertical: 14, ...shadow.orange,
  },
  unlockText: { color: "#FFFFFF", fontSize: 15, fontFamily: font.semi },
  unlockHint: { color: "#8FB0C0", fontSize: 13, fontFamily: font.bodyMedium },
});
