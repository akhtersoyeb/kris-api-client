import { ipc } from "@/lib/ipc";
import { useVariablesStore } from "@/store/variables";
import type { EnvironmentSummary } from "@/lib/bindings";
import { guarded } from "@/features/workspace/actions";
import { useDialogs } from "@/store/dialogs";

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

export async function createEnvironmentFlow(): Promise<string | null> {
  const name = await useDialogs
    .getState()
    .askName({ title: "New environment", confirmLabel: "Create" });
  if (!name) return null;
  const env = await guarded("Could not create environment", () => ipc.createEnvironment(name));
  if (!env) return null;
  await loadEnvironments();
  const state = useVariablesStore.getState();
  if (!state.activeEnvId) state.setActive(env.id); // the first environment becomes the active one
  return env.id;
}

export async function duplicateEnvironmentFlow(id: string): Promise<string | null> {
  const env = await guarded("Could not duplicate environment", () => ipc.duplicateEnvironment(id));
  if (!env) return null;
  await loadEnvironments();
  return env.id;
}

export async function deleteEnvironmentFlow(env: EnvironmentSummary): Promise<boolean> {
  const ok = await useDialogs.getState().askConfirm({
    title: `Delete "${env.name}"?`,
    description:
      "Its variables, and any secrets stored for it in the system keychain, are removed.",
    confirmLabel: "Delete",
    destructive: true,
  });
  if (!ok) return false;
  const done = await guarded("Could not delete environment", async () => {
    await ipc.deleteEnvironment(env.id);
    return true;
  });
  if (!done) return false;
  const state = useVariablesStore.getState();
  if (state.activeEnvId === env.id) state.setActive(null);
  await loadEnvironments();
  state.bump();
  return true;
}
