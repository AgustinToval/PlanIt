// App settings: theme (light/dark) + language (en/es), persisted on device.
import { create } from "zustand";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { darkColors, lightColors, Palette } from "../lib/theme";
import { translations, TKey, Lang } from "../lib/i18n";

type ThemeMode = "light" | "dark";

const store = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === "web") return localStorage.getItem(key);
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") { localStorage.setItem(key, value); return; }
    await SecureStore.setItemAsync(key, value);
  },
};

type SettingsStore = {
  theme: ThemeMode;
  lang: Lang;
  biometric: boolean;
  loaded: boolean;
  load: () => Promise<void>;
  setTheme: (t: ThemeMode) => void;
  setLang: (l: Lang) => void;
  setBiometric: (b: boolean) => void;
};

export const useSettings = create<SettingsStore>((set) => ({
  theme: "light",
  lang: "en",
  biometric: false,
  loaded: false,

  load: async () => {
    try {
      const [theme, lang, biometric] = await Promise.all([
        store.get("planit_theme"),
        store.get("planit_lang"),
        store.get("planit_biometric"),
      ]);
      set({
        theme: theme === "dark" ? "dark" : "light",
        lang: lang === "es" ? "es" : "en",
        biometric: biometric === "1",
        loaded: true,
      });
    } catch {
      set({ loaded: true });
    }
  },

  setTheme: (theme) => {
    set({ theme });
    store.set("planit_theme", theme).catch(() => {});
  },

  setLang: (lang) => {
    set({ lang });
    store.set("planit_lang", lang).catch(() => {});
  },

  setBiometric: (biometric) => {
    set({ biometric });
    store.set("planit_biometric", biometric ? "1" : "0").catch(() => {});
  },
}));

// Current palette — re-renders subscribers when the theme changes
export function useTheme(): Palette {
  const theme = useSettings((s) => s.theme);
  return theme === "dark" ? darkColors : lightColors;
}

// Translator for the current language
export function useT(): (key: TKey) => string {
  const lang = useSettings((s) => s.lang);
  return (key: TKey) => translations[lang][key] ?? translations.en[key] ?? key;
}
