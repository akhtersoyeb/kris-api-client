import { ipc } from "@/lib/ipc";
import { useVariablesStore } from "@/store/variables";

export async function loadEnvironments() {
  try {
    const list = await ipc.listEnvironments();
    const state = useVariablesStore.getState();
    state.setEnvironments(list);
    // The selected environment may have been deleted (or renamed away) outside the app.
    if (state.activeEnvId && !list.some((e) => e.id === state.activeEnvId)) state.setActive(null);
  } catch {
    /* keep the previous list; the next change event retries */
  }
}

let contextRequest = 0;

export async function refreshContext(envId: string | null, requestPath: string | null) {
  const request = ++contextRequest;
  let infos: Awaited<ReturnType<typeof ipc.variableContext>> = [];
  try {
    infos = await ipc.variableContext(envId, requestPath);
  } catch {
    /* no workspace or a transient error: highlight nothing as known */
  }
  if (request === contextRequest) useVariablesStore.getState().setContext(infos); // ignore stale replies
}
