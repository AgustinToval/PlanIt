import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import { api } from "../lib/api";

WebBrowser.maybeCompleteAuthSession();

type User = {
  id: string;
  name: string | null;
  email: string;
  avatar: string | null;
  username: string | null;
};

type AuthStore = {
  token: string | null;
  user: User | null;
  loading: boolean;
  loadToken: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (user: User) => void;
};

export const useAuthStore = create<AuthStore>((set) => ({
  token: null,
  user: null,
  loading: false,

  loadToken: async () => {
    const token = await SecureStore.getItemAsync("planit_token");
    if (token) {
      api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      try {
        const res = await api.get("/users/me");
        set({ token, user: res.data });
      } catch {
        await SecureStore.deleteItemAsync("planit_token");
        set({ token: null, user: null });
      }
    }
  },

  signInWithGoogle: async () => {
    // Placeholder — will be wired to real Google OAuth in Phase 2
    // For now sets a mock user for testing the UI
    set({ loading: true });
    try {
      await new Promise((r) => setTimeout(r, 1000));
      const mockUser: User = {
        id: "mock-id",
        name: "AgustinToval",
        email: "agntoval@gmail.com",
        avatar: null,
        username: "agustintoval",
      };
      set({ token: "mock-token", user: mockUser, loading: false });
      await SecureStore.setItemAsync("planit_token", "mock-token");
    } catch {
      set({ loading: false });
    }
  },

  signOut: async () => {
    await SecureStore.deleteItemAsync("planit_token");
    set({ token: null, user: null });
  },

  setUser: (user) => set({ user }),
}));
