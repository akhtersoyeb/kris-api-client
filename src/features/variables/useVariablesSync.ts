import { useEffect } from "react";
import { useTabsStore } from "@/store/tabs";
import { useVariablesStore } from "@/store/variables";
import { refreshContext } from "./actions";

/** Keeps the effective-variables map in step with the environment, the active request and edits. */
export function useVariablesSync() {
  const requestPath = useTabsStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.path ?? null);
  const envId = useVariablesStore((s) => s.activeEnvId);
  const version = useVariablesStore((s) => s.version);

  useEffect(() => {
    void refreshContext(envId, requestPath);
  }, [envId, requestPath, version]);
}
