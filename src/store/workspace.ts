import { create } from "zustand";
import type { NodeEntry, RecentWorkspace, WorkspaceInfo } from "@/lib/bindings";
import { remapPath } from "@/lib/paths";

interface WorkspaceState {
  info: { id: string; root: string; name: string } | null;
  nodes: NodeEntry[];
  warnings: string[];
  expanded: Record<string, true>;
  recents: RecentWorkspace[];
  apply: (info: WorkspaceInfo) => void;
  clear: () => void;
  setRecents: (recents: RecentWorkspace[]) => void;
  toggle: (path: string, open?: boolean) => void;
  setExpanded: (paths: string[]) => void;
  remapExpanded: (from: string, to: string) => void;
}

export const useWorkspaceStore = create<WorkspaceState>()((set) => ({
  info: null,
  nodes: [],
  warnings: [],
  expanded: {},
  recents: [],

  apply: (info) =>
    set({
      info: { id: info.id, root: info.root, name: info.name },
      nodes: info.nodes,
      warnings: info.warnings,
    }),
  clear: () => set({ info: null, nodes: [], warnings: [], expanded: {} }),
  setRecents: (recents) => set({ recents }),

  toggle: (path, open) =>
    set((s) => {
      const isOpen = !!s.expanded[path];
      const next = open ?? !isOpen;
      if (next === isOpen) return s;
      const { [path]: _removed, ...rest } = s.expanded;
      return { expanded: next ? { ...s.expanded, [path]: true } : rest };
    }),

  setExpanded: (paths) =>
    set({ expanded: Object.fromEntries(paths.map((p) => [p, true as const])) }),

  remapExpanded: (from, to) =>
    set((s) => ({
      expanded: Object.fromEntries(
        Object.keys(s.expanded).map((p) => [remapPath(p, from, to), true as const]),
      ),
    })),
}));
