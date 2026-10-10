import { toast } from "sonner";
import { IpcError, ipc } from "@/lib/ipc";
import { useDialogs } from "@/store/dialogs";
import { snapshot, tabToRequestFile, snapshotOfFile } from "@/store/request-doc";
import { useTabsStore } from "@/store/tabs";
import { useWorkspaceStore } from "@/store/workspace";
import { errorMessage, refreshTree } from "./actions";
import type { RequestFile } from "@/lib/bindings";
import { isUnder } from "@/lib/paths";
import { loadEnvironments } from "@/features/variables/actions";
import { useVariablesStore } from "@/store/variables";

const getTab = (id: string) => useTabsStore.getState().tabs.find((t) => t.id === id);

/** Saves to the tab's file, or asks where to put a new request. Returns false if nothing was saved. */
export async function saveTab(tabId: string): Promise<boolean> {
  const tab = getTab(tabId);
  if (!tab) return false;
  const workspace = useWorkspaceStore.getState();
  const tabs = useTabsStore.getState();

  try {
    if (tab.path) {
      // Capture before the await: edits made while saving must stay "unsaved".
      const snap = snapshot(tab);
      await ipc.saveRequest(tab.path, tabToRequestFile(tab));
      tabs.markSaved(tabId, snap);
      return true;
    }

    const location = await useDialogs
      .getState()
      .askLocation(tab.title === "New Request" ? "" : tab.title);
    if (!location) return false;
    const snap = snapshot({ ...tab, title: location.name });
    const file = tabToRequestFile(tab, location.name);

    let parentPath = location.parentPath;
    if (parentPath === "") {
      const created = await ipc.createCollection("My Requests");
      workspace.apply(created.info);
      parentPath = created.path;
    }
    const m = await ipc.createRequest(parentPath, file);
    workspace.apply(m.info);
    workspace.toggle(parentPath, true);
    tabs.bindToPath(tabId, m.path, location.name, snap);
    return true;
  } catch (e) {
    if (e instanceof IpcError && e.kind === "NotFound" && tab.path) {
      tabs.detach(tabId);
      toast.warning("That request's file no longer exists", {
        description: "Save again to choose a new location.",
      });
    } else {
      toast.error("Could not save", { description: errorMessage(e) });
    }
    return false;
  }
}

export async function saveActiveTab() {
  const id = useTabsStore.getState().activeTabId;
  if (id) await saveTab(id);
}

/** Closes a tab, asking first if it has unsaved changes. */
export async function requestCloseTab(tabId: string) {
  const tab = getTab(tabId);
  if (!tab) return;
  if (tab.dirty) {
    const choice = await useDialogs.getState().askUnsaved(tab.title);
    if (choice === "cancel") return;
    if (choice === "save" && !(await saveTab(tabId))) return;
  }
  useTabsStore.getState().closeTab(tabId);
}

export async function syncTabWithDisk(tabId: string) {
  const before = getTab(tabId);
  if (!before?.path) return;

  let file: RequestFile;
  try {
    file = await ipc.loadRequest(before.path);
  } catch (e) {
    if (e instanceof IpcError && e.kind === "NotFound") {
      useTabsStore.getState().detach(tabId);
      toast.warning(`"${before.title}" was deleted or moved on disk`, {
        description: "It stays open as an unsaved draft.",
      });
    }
    return; // anything else (for example another tool mid-write): wait for the next change
  }

  const tab = getTab(tabId); // may have changed while we awaited
  if (!tab?.path) return;
  if (snapshotOfFile(file) === tab.saved) return; // our own write, or nothing really changed

  if (tab.dirty) useTabsStore.getState().setConflict(tabId, true);
  else useTabsStore.getState().applyFile(tabId, tab.path, file);
}

export async function reloadFromDisk(tabId: string) {
  const tab = getTab(tabId);
  if (!tab?.path) return;
  try {
    useTabsStore.getState().applyFile(tabId, tab.path, await ipc.loadRequest(tab.path));
  } catch (e) {
    toast.error("Could not reload", { description: errorMessage(e) });
  }
}

/** Accept the disk version as the new baseline but keep editing; Save will overwrite it. */
export async function keepMine(tabId: string) {
  const tab = getTab(tabId);
  if (!tab?.path) return;
  try {
    useTabsStore.getState().setSavedBase(tabId, snapshotOfFile(await ipc.loadRequest(tab.path)));
  } catch (e) {
    toast.error("Could not check the file", { description: errorMessage(e) });
  }
}

export async function handleExternalChange(paths: string[]) {
  await refreshTree();
  const touchesVariables = paths.some(
    (p) => p.startsWith("environments/") || p === "workspace.json" || p.endsWith("collection.json"),
  );
  if (touchesVariables) {
    await loadEnvironments();
    useVariablesStore.getState().bump();
  }
  const touched = (tabPath: string) => paths.some((p) => p !== "" && isUnder(tabPath, p));
  const affected = useTabsStore.getState().tabs.filter((t) => t.path && touched(t.path));
  await Promise.all(affected.map((t) => syncTabWithDisk(t.id)));
}
