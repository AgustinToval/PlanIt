import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useAuthStore } from "../hooks/useAuthStore";

export default function RootLayout() {
  const { token, loadToken } = useAuthStore();

  useEffect(() => {
    loadToken();
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!!token}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="group/[id]" />
          <Stack.Screen name="plan/[id]" />
        </Stack.Protected>

        <Stack.Protected guard={!token}>
          <Stack.Screen name="(auth)/sign-in" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
