import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark" | "system";

interface ThemeState {
  theme: Theme;
  isDark: boolean; // resolved value, set by ThemeProvider
  setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: "system",
      isDark: false,
      setTheme: (theme) => set({ theme }),
    }),
    { name: "api-client:theme", partialize: (s) => ({ theme: s.theme }) },
  ),
);
