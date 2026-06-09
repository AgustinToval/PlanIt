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
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        {token ? (
          <Stack.Screen name="(tabs)" />
        ) : (
          <Stack.Screen name="(auth)" />
        )}
        <Stack.Screen name="group/[id]" />
        <Stack.Screen name="plan/[id]" />
      </Stack>
    </>
  );
}
