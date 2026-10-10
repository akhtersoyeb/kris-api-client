import { create } from "zustand";
import type { EnvironmentSummary, VariableInfo } from "@/lib/bindings";

export type ManagerSelection =
  { kind: "global" } | { kind: "collection"; path: string } | { kind: "environment"; id: string };

interface VariablesState {
  environments: EnvironmentSummary[];
  activeEnvId: string | null;
  /** Effective variables for the active tab, keyed by name. Never contains secret values. */
  context: Record<string, VariableInfo>;
  /** Bumped whenever variables change, so highlighting and previews refetch. */
  version: number;
  manager: { open: boolean; selection: ManagerSelection | null };
  setEnvironments: (list: EnvironmentSummary[]) => void;
  setActive: (id: string | null) => void;
  setContext: (infos: VariableInfo[]) => void;
  bump: () => void;
  openManager: (selection?: ManagerSelection) => void;
  selectInManager: (selection: ManagerSelection) => void;
  closeManager: () => void;
  reset: () => void;
}

function defaultSelection(
  s: Pick<VariablesState, "activeEnvId" | "environments">,
): ManagerSelection {
  const id = s.activeEnvId ?? s.environments[0]?.id;
  return id ? { kind: "environment", id } : { kind: "global" };
}

const initial = {
  environments: [] as EnvironmentSummary[],
  activeEnvId: null as string | null,
  context: {} as Record<string, VariableInfo>,
  version: 0,
  manager: { open: false, selection: null as ManagerSelection | null },
};

export const useVariablesStore = create<VariablesState>()((set) => ({
  ...initial,
  setEnvironments: (environments) => set({ environments }),
  setActive: (activeEnvId) => set({ activeEnvId }),
  setContext: (infos) => set({ context: Object.fromEntries(infos.map((i) => [i.name, i])) }),
  bump: () => set((s) => ({ version: s.version + 1 })),
  openManager: (selection) =>
    set((s) => ({ manager: { open: true, selection: selection ?? defaultSelection(s) } })),
  selectInManager: (selection) => set((s) => ({ manager: { ...s.manager, selection } })),
  closeManager: () => set({ manager: { open: false, selection: null } }),
  reset: () => set({ ...initial }),
}));
