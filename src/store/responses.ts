import { create } from "zustand";
import type { ResponseSpec } from "@/lib/bindings";
import { IpcError, ipc } from "@/lib/ipc";
import { buildRequestSpec } from "@/features/request-editor/spec";
import { useTabsStore } from "@/store/tabs";
import { useVariablesStore } from "@/store/variables";

export interface RunError {
  kind: string;
  message: string;
}

/** No entry for a tab means idle. */
export type RequestRun =
  | { phase: "sending"; requestId: string }
  | { phase: "done"; response: ResponseSpec }
  | { phase: "error"; error: RunError };

interface ResponsesState {
  runs: Record<string, RequestRun>;
  send: (tabId: string) => Promise<void>;
  cancel: (tabId: string) => Promise<void>;
  clear: (tabId: string) => void;
}

export const useResponsesStore = create<ResponsesState>()((set, get) => {
  const setRun = (tabId: string, run: RequestRun) =>
    set((s) => ({ runs: { ...s.runs, [tabId]: run } }));
  const removeRun = (tabId: string) =>
    set((s) => {
      const { [tabId]: _removed, ...rest } = s.runs;
      return { runs: rest };
    });

  return {
    runs: {},

    send: async (tabId) => {
      const tab = useTabsStore.getState().tabs.find((t) => t.id === tabId);
      if (!tab || get().runs[tabId]?.phase === "sending") return;

      const requestId = crypto.randomUUID();
      setRun(tabId, { phase: "sending", requestId });
      // If the user cancelled or re-sent meanwhile, this result is stale.
      const isCurrent = () => {
        const run = get().runs[tabId];
        return run?.phase === "sending" && run.requestId === requestId;
      };

      try {
        const response = await ipc.sendRequest(
          requestId,
          buildRequestSpec(tab),
          useVariablesStore.getState().activeEnvId,
          tab.path,
        );
        if (isCurrent()) setRun(tabId, { phase: "done", response });
      } catch (e) {
        if (!isCurrent()) return;
        if (e instanceof IpcError) {
          if (e.kind === "Cancelled") removeRun(tabId);
          else setRun(tabId, { phase: "error", error: { kind: e.kind, message: e.message } });
        } else {
          setRun(tabId, { phase: "error", error: { kind: "Internal", message: String(e) } });
        }
      }
    },

    cancel: async (tabId) => {
      const run = get().runs[tabId];
      if (run?.phase !== "sending") return;
      removeRun(tabId); // UI goes idle immediately
      await ipc.cancelRequest(run.requestId).catch(() => undefined);
    },

    clear: removeRun,
  };
});

// Closing a tab cancels its request and frees its (possibly large) response.
useTabsStore.subscribe((state, prev) => {
  if (state.tabs.length >= prev.tabs.length) return;
  const live = new Set(state.tabs.map((t) => t.id));
  const { runs, cancel, clear } = useResponsesStore.getState();
  for (const id of Object.keys(runs)) {
    if (!live.has(id)) {
      void cancel(id);
      clear(id);
    }
  }
});
