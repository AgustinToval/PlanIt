// Push notifications: permission + Expo token registration.
// Remote push only works in a NATIVE build (TestFlight / stores) — in Expo Go
// registration is skipped silently (no projectId / SDK 53+ limitation).
import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { api } from "./api";

// Show notifications also while the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPush(): Promise<void> {
  try {
    if (Platform.OS === "web" || !Device.isDevice) return;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return; // Expo Go / not yet linked with `eas init`

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#F77F00",
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== "granted") {
      const res = await Notifications.requestPermissionsAsync();
      status = res.status;
    }
    if (status !== "granted") return;

    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await api.post("/users/me/push-token", { token });
  } catch (e) {
    console.log("push registration skipped:", e);
  }
}

export async function unregisterPush(): Promise<void> {
  try {
    await api.post("/users/me/push-token", { token: null });
  } catch { /* noop */ }
}
