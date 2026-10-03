import { create } from "zustand";
import {
  defaultBody,
  defaultSettings,
  type BodyDraft,
  type KeyValueRow,
  type SettingsDraft,
} from "@/store/request-draft";

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export interface RequestTab {
  id: string;
  title: string;
  method: HttpMethod;
  url: string;
  dirty: boolean;
  params: KeyValueRow[];
  headers: KeyValueRow[];
  body: BodyDraft;
  settings: SettingsDraft;
}

export type TabPatch = Partial<Omit<RequestTab, "id">>;

interface TabsState {
  tabs: RequestTab[];
  activeTabId: string | null;
  openTab: (init?: TabPatch) => string;
  closeTab: (id: string) => void;
  closeOtherTabs: (id: string) => void;
  setActiveTab: (id: string) => void;
  moveTab: (from: number, to: number) => void;
  /** Applies a patch and marks the tab dirty unless `dirty` is passed explicitly. */
  updateTab: (id: string, patch: TabPatch) => void;
}

export const useTabsStore = create<TabsState>()((set) => ({
  tabs: [],
  activeTabId: null,

  openTab: (init = {}) => {
    const tab: RequestTab = {
      id: crypto.randomUUID(),
      title: "New Request",
      method: "GET",
      url: "",
      dirty: false,
      params: [],
      headers: [],
      body: defaultBody(),
      settings: defaultSettings(),
      ...init,
    };
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
    return tab.id;
  },

  closeTab: (id) =>
    set((s) => {
      const index = s.tabs.findIndex((t) => t.id === id);
      if (index === -1) return s;
      const tabs = s.tabs.filter((t) => t.id !== id);
      const activeTabId =
        s.activeTabId === id ? (tabs[index]?.id ?? tabs[index - 1]?.id ?? null) : s.activeTabId;
      return { tabs, activeTabId };
    }),

  closeOtherTabs: (id) =>
    set((s) => {
      const keep = s.tabs.find((t) => t.id === id);
      return keep ? { tabs: [keep], activeTabId: keep.id } : s;
    }),

  setActiveTab: (id) => set((s) => (s.tabs.some((t) => t.id === id) ? { activeTabId: id } : s)),

  moveTab: (from, to) =>
    set((s) => {
      const inRange = (i: number) => i >= 0 && i < s.tabs.length;
      if (!inRange(from) || !inRange(to) || from === to) return s;
      const tabs = [...s.tabs];
      const [moved] = tabs.splice(from, 1);
      if (!moved) return s;
      tabs.splice(to, 0, moved);
      return { tabs };
    }),

  updateTab: (id, patch) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, dirty: true, ...patch } : t)),
    })),
}));
