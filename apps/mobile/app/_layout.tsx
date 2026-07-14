import { useEffect, useRef, useState } from "react";
import { View, Text, Image, Animated, StyleSheet } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts, Poppins_600SemiBold, Poppins_700Bold } from "@expo-google-fonts/poppins";
import {
  Montserrat_400Regular, Montserrat_500Medium, Montserrat_600SemiBold, Montserrat_700Bold,
} from "@expo-google-fonts/montserrat";
import { useAuthStore } from "../hooks/useAuthStore";
import { colors, font } from "../lib/theme";

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

export default function RootLayout() {
  const { token, loadToken } = useAuthStore();
  const [splashDone, setSplashDone] = useState(false);
  const [fontsLoaded] = useFonts({
    Poppins_600SemiBold, Poppins_700Bold,
    Montserrat_400Regular, Montserrat_500Medium, Montserrat_600SemiBold, Montserrat_700Bold,
  });

  useEffect(() => {
    loadToken();
  }, []);

  if (!fontsLoaded || !splashDone) {
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

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
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
});
