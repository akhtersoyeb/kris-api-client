// src/store/ui.ts
import { create } from "zustand";

interface UiState {
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  /** Collection whose auth is being edited. */
  collectionAuthPath: string | null;
  openCollectionAuth: (path: string) => void;
  closeCollectionAuth: () => void;
  /** Bumped when a collection's auth changes, so request tabs refresh their "inherited" summary. */
  authVersion: number;
  bumpAuth: () => void;
}

export const useUiStore = create<UiState>()((set) => ({
  settingsOpen: false,
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  collectionAuthPath: null,
  openCollectionAuth: (collectionAuthPath) => set({ collectionAuthPath }),
  closeCollectionAuth: () => set({ collectionAuthPath: null }),
  authVersion: 0,
  bumpAuth: () => set((s) => ({ authVersion: s.authVersion + 1 })),
}));
