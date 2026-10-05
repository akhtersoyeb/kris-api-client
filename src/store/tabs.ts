import { create } from "zustand";
import type { RequestFile } from "@/lib/bindings";
import { isUnder, remapPath } from "@/lib/paths";
import { isDirty, requestFileToFields, snapshot, withSnapshotName } from "@/store/request-doc";
import {
  HTTP_METHODS,
  defaultBody,
  defaultSettings,
  type BodyDraft,
  type HttpMethod,
  type KeyValueRow,
  type SettingsDraft,
} from "@/store/request-draft";

export { HTTP_METHODS };
export type { HttpMethod };

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
  /** Workspace-relative file path, or null for a request that hasn't been saved yet. */
  path: string | null;
  /** Snapshot of the content as last saved or loaded. "Dirty" means "differs from this". */
  saved: string | null;
  /** The file changed on disk while this tab had unsaved edits. */
  conflict: boolean;
}

export type TabPatch = Partial<Omit<RequestTab, "id">>;

interface TabsState {
  tabs: RequestTab[];
  activeTabId: string | null;
  openTab: (init?: TabPatch) => string;
  openSavedRequest: (path: string, file: RequestFile) => string;
  closeTab: (id: string) => void;
  closeOtherTabs: (id: string) => void;
  setActiveTab: (id: string) => void;
  moveTab: (from: number, to: number) => void;
  /** Applies a patch and recomputes the dirty flag unless `dirty` is passed explicitly. */
  updateTab: (id: string, patch: TabPatch) => void;
  markSaved: (id: string, snap: string) => void;
  bindToPath: (id: string, path: string, name: string, snap: string) => void;
  applyFile: (id: string, path: string, file: RequestFile) => void;
  setSavedBase: (id: string, snap: string) => void;
  setConflict: (id: string, conflict: boolean) => void;
  detach: (id: string) => void;
  detachUnder: (prefix: string) => number;
  retarget: (from: string, to: string, newName?: string) => void;
  replaceAll: (tabs: RequestTab[], activeTabId: string | null) => void;
  reset: () => void;
}

function makeTab(init: TabPatch = {}): RequestTab {
  return {
    id: crypto.randomUUID(),
    title: "New Request",
    method: "GET",
    url: "",
    dirty: false,
    params: [],
    headers: [],
    body: defaultBody(),
    settings: defaultSettings(),
    path: null,
    saved: null,
    conflict: false,
    ...init,
  };
}

const withDirty = (tab: RequestTab): RequestTab => ({ ...tab, dirty: isDirty(tab) });
const mapTab = (id: string, fn: (tab: RequestTab) => RequestTab) => (s: TabsState) => ({
  tabs: s.tabs.map((t) => (t.id === id ? fn(t) : t)),
});

export const useTabsStore = create<TabsState>()((set) => ({
  tabs: [],
  activeTabId: null,

  openTab: (init = {}) => {
    const tab = makeTab(init);
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
    return tab.id;
  },

  openSavedRequest: (path, file) => {
    const tab = makeTab({ ...requestFileToFields(file), path });
    tab.saved = snapshot(tab);
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
    set(
      mapTab(id, (t) => {
        const next = { ...t, ...patch };
        return { ...next, dirty: patch.dirty ?? isDirty(next) };
      }),
    ),

  markSaved: (id, snap) =>
    set(mapTab(id, (t) => withDirty({ ...t, saved: snap, conflict: false }))),

  bindToPath: (id, path, name, snap) =>
    set(mapTab(id, (t) => withDirty({ ...t, path, title: name, saved: snap, conflict: false }))),

  applyFile: (id, path, file) =>
    set(
      mapTab(id, (t) => {
        const next = { ...t, ...requestFileToFields(file), path, conflict: false };
        return { ...next, saved: snapshot(next), dirty: false };
      }),
    ),

  setSavedBase: (id, snap) =>
    set(mapTab(id, (t) => withDirty({ ...t, saved: snap, conflict: false }))),

  setConflict: (id, conflict) => set(mapTab(id, (t) => ({ ...t, conflict }))),

  detach: (id) =>
    set(mapTab(id, (t) => withDirty({ ...t, path: null, saved: null, conflict: false }))),

  detachUnder: (prefix) => {
    let count = 0;
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (!t.path || !isUnder(t.path, prefix)) return t;
        count++;
        return withDirty({ ...t, path: null, saved: null, conflict: false });
      }),
    }));
    return count;
  },

  retarget: (from, to, newName) =>
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (!t.path || !isUnder(t.path, from)) return t;
        const path = remapPath(t.path, from, to);
        if (newName !== undefined && t.path === from) {
          return withDirty({
            ...t,
            path,
            title: newName,
            saved: withSnapshotName(t.saved, newName),
          });
        }
        return { ...t, path };
      }),
    })),

  replaceAll: (tabs, activeTabId) => set({ tabs, activeTabId }),
  reset: () => set({ tabs: [], activeTabId: null }),
}));
