import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import type { WorkspaceInfo } from "@/lib/bindings";
import { ipc } from "@/lib/ipc";
import { useDialogs } from "@/store/dialogs";
import { useResponsesStore } from "@/store/responses";
import { useTabsStore } from "@/store/tabs";
import { useWorkspaceStore } from "@/store/workspace";
import type { Mutation } from "@/lib/bindings";
import { blankRequestFile } from "@/store/request-doc";
import type { NodeEntry } from "@/lib/bindings";
import { flushSession, restoreSession } from "./session";
import { loadEnvironments } from "@/features/variables/actions";
import { useVariablesStore } from "@/store/variables";

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Runs an action and shows a failure as a toast instead of throwing into the UI. */
export async function guarded<T>(label: string, run: () => Promise<T>): Promise<T | undefined> {
  try {
    return await run();
  } catch (e) {
    toast.error(label, { description: errorMessage(e) });
    return undefined;
  }
}

// ---------- workspace lifecycle ----------

export async function activateWorkspace(info: WorkspaceInfo) {
  await flushSession(); // save the previous workspace's session before switching
  useResponsesStore.setState({ runs: {} });
  useTabsStore.getState().reset();
  useVariablesStore.getState().reset();
  const workspace = useWorkspaceStore.getState();
  workspace.apply(info);
  workspace.setExpanded(info.nodes.filter((n) => n.kind === "collection").map((n) => n.path));
  await restoreSession(info.id);
  await loadEnvironments();
  if (useTabsStore.getState().tabs.length === 0) useTabsStore.getState().openTab();
}

export async function openWorkspaceAt(path: string) {
  const info = await guarded("Could not open workspace", () => ipc.openWorkspace(path));
  if (info) await activateWorkspace(info);
}

export async function chooseAndOpenWorkspace() {
  const dir = await open({ directory: true, title: "Open workspace folder" });
  if (typeof dir === "string") await openWorkspaceAt(dir);
}

export async function createWorkspaceFlow() {
  const name = await useDialogs.getState().askName({
    title: "New workspace",
    label: "Workspace name",
    confirmLabel: "Choose folder...",
  });
  if (!name) return;
  const parent = await open({ directory: true, title: "Where should the workspace folder go?" });
  if (typeof parent !== "string") return;
  const info = await guarded("Could not create workspace", () => ipc.createWorkspace(parent, name));
  if (info) await activateWorkspace(info);
}

export async function closeWorkspace() {
  await flushSession();
  await ipc.closeWorkspace();
  useResponsesStore.setState({ runs: {} });
  useTabsStore.getState().reset();
  useVariablesStore.getState().reset();
  useWorkspaceStore.getState().clear();
  void refreshRecents();
}

export async function refreshRecents() {
  try {
    useWorkspaceStore.getState().setRecents(await ipc.listRecentWorkspaces());
  } catch {
    /* the welcome screen simply shows no recents */
  }
}

export async function forgetRecent(path: string) {
  await guarded("Could not update the list", () => ipc.forgetRecentWorkspace(path));
  await refreshRecents();
}

export async function refreshTree() {
  try {
    useWorkspaceStore.getState().apply(await ipc.refreshWorkspace());
  } catch {
    /* transient (for example the folder is being moved); the next event retries */
  }
}

const applyMutation = (m: Mutation) => useWorkspaceStore.getState().apply(m.info);

export async function openRequest(path: string) {
  const existing = useTabsStore.getState().tabs.find((t) => t.path === path);
  if (existing) {
    useTabsStore.getState().setActiveTab(existing.id);
    return;
  }
  const file = await guarded("Could not open request", () => ipc.loadRequest(path));
  if (file) useTabsStore.getState().openSavedRequest(path, file);
}

export async function newCollection() {
  const name = await useDialogs
    .getState()
    .askName({ title: "New collection", confirmLabel: "Create" });
  if (!name) return;
  const m = await guarded("Could not create collection", () => ipc.createCollection(name));
  if (!m) return;
  applyMutation(m);
  useWorkspaceStore.getState().toggle(m.path, true);
}

const noun = (n: NodeEntry) => (n.kind === "request" ? "request" : n.kind);

export async function newFolder(parent: NodeEntry) {
  const name = await useDialogs.getState().askName({ title: "New folder", confirmLabel: "Create" });
  if (!name) return;
  const m = await guarded("Could not create folder", () => ipc.createFolder(parent.path, name));
  if (!m) return;
  applyMutation(m);
  useWorkspaceStore.getState().toggle(parent.path, true);
  useWorkspaceStore.getState().toggle(m.path, true);
}

export async function newRequest(parent: NodeEntry) {
  const name = await useDialogs
    .getState()
    .askName({ title: "New request", confirmLabel: "Create" });
  if (!name) return;
  const m = await guarded("Could not create request", () =>
    ipc.createRequest(parent.path, blankRequestFile(name)),
  );
  if (!m) return;
  applyMutation(m);
  useWorkspaceStore.getState().toggle(parent.path, true);
  await openRequest(m.path);
}

export async function renameNode(node: NodeEntry) {
  const name = await useDialogs.getState().askName({
    title: `Rename ${noun(node)}`,
    initial: node.name,
    confirmLabel: "Rename",
  });
  if (!name || name === node.name) return;
  const m = await guarded("Could not rename", () => ipc.renameNode(node.path, name));
  if (!m) return;
  applyMutation(m);
  useWorkspaceStore.getState().remapExpanded(node.path, m.path);
  useTabsStore.getState().retarget(node.path, m.path, node.kind === "request" ? name : undefined);
}

export async function duplicateNode(node: NodeEntry) {
  const m = await guarded("Could not duplicate", () => ipc.duplicateNode(node.path));
  if (m) applyMutation(m);
}

export async function deleteNode(node: NodeEntry) {
  const ok = await useDialogs.getState().askConfirm({
    title: `Delete "${node.name}"?`,
    description:
      node.kind === "request"
        ? "This permanently deletes the request file."
        : `This permanently deletes the ${noun(node)} and everything inside it.`,
    confirmLabel: "Delete",
    destructive: true,
  });
  if (!ok) return;
  const info = await guarded("Could not delete", () => ipc.deleteNode(node.path));
  if (!info) return;
  useWorkspaceStore.getState().apply(info);
  const kept = useTabsStore.getState().detachUnder(node.path);
  if (kept > 0)
    toast.info(`${kept} open tab${kept === 1 ? " was" : "s were"} kept as unsaved drafts`);
}

export async function moveNode(node: NodeEntry, parentPath: string, order: string[]) {
  const m = await guarded("Could not move", () => ipc.moveNode(node.path, parentPath, order));
  if (!m) return;
  applyMutation(m);
  const workspace = useWorkspaceStore.getState();
  workspace.remapExpanded(node.path, m.path);
  useTabsStore.getState().retarget(node.path, m.path);
  if (parentPath) workspace.toggle(parentPath, true);
}
