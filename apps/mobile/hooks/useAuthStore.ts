import { create } from "zustand";
import { api, tokenStorage } from "../lib/api";

type User = {
  id: string;
  name: string | null;
  email: string;
  avatar: string | null;
  username: string | null;
  bio?: string | null;
  location?: string | null;
};

type AuthStore = {
  token: string | null;
  user: User | null;
  loading: boolean;
  error: string | null;
  loadToken: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (user: User) => void;
  clearError: () => void;
};

export const useAuthStore = create<AuthStore>((set) => ({
  token: null,
  user: null,
  loading: false,
  error: null,

  loadToken: async () => {
    const token = await tokenStorage.get();
    if (!token) return;
    try {
      const res = await api.get("/users/me");
      set({ token, user: res.data });
    } catch {
      await tokenStorage.delete();
      set({ token: null, user: null });
    }
  },

  signIn: async (email: string, password: string) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post("/auth/login", { email, password });
      await tokenStorage.set(res.data.token);
      set({ token: res.data.token, user: res.data.user, loading: false });
    } catch (e: any) {
      set({
        loading: false,
        error: e?.response?.data?.error ?? "Could not reach the server",
      });
    }
  },

  signUp: async (name: string, email: string, password: string) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post("/auth/register", { name, email, password });
      await tokenStorage.set(res.data.token);
      set({ token: res.data.token, user: res.data.user, loading: false });
    } catch (e: any) {
      set({
        loading: false,
        error: e?.response?.data?.error ?? "Could not reach the server",
      });
    }
  },

  signOut: async () => {
    await tokenStorage.delete();
    set({ token: null, user: null });
  },

  setUser: (user) => set({ user }),
  clearError: () => set({ error: null }),
}));
