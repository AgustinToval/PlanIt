import axios from "axios";
import Constants from "expo-constants";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// Resolve the dev machine's LAN IP from the Expo bundler URL so the phone
// can reach the API on the same network. Falls back to localhost on web.
function resolveBaseUrl(): string {
  const debuggerHost = Constants.expoConfig?.hostUri; // e.g. "192.168.1.37:8081"
  const host = debuggerHost?.split(":")[0];
  if (Platform.OS === "web" || !host) return "http://localhost:4000/api";
  return `http://${host}:4000/api`;
}

export const api = axios.create({
  baseURL: resolveBaseUrl(),
  headers: { "Content-Type": "application/json" },
  timeout: 10000,
});

// SecureStore is unavailable on web — fall back to localStorage.
export const tokenStorage = {
  async get(): Promise<string | null> {
    if (Platform.OS === "web") return localStorage.getItem("planit_token");
    return SecureStore.getItemAsync("planit_token");
  },
  async set(value: string): Promise<void> {
    if (Platform.OS === "web") { localStorage.setItem("planit_token", value); return; }
    await SecureStore.setItemAsync("planit_token", value);
  },
  async delete(): Promise<void> {
    if (Platform.OS === "web") { localStorage.removeItem("planit_token"); return; }
    await SecureStore.deleteItemAsync("planit_token");
  },
};

// Attach JWT token to every request
api.interceptors.request.use(async (config) => {
  const token = await tokenStorage.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401) {
      await tokenStorage.delete();
    }
    return Promise.reject(error);
  }
);

export function getSocketUrl(): string {
  return resolveBaseUrl().replace("/api", "");
}
