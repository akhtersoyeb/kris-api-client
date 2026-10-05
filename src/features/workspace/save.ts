import { toast } from "sonner";
import { IpcError, ipc } from "@/lib/ipc";
import { useDialogs } from "@/store/dialogs";
import { snapshot, tabToRequestFile } from "@/store/request-doc";
import { useTabsStore } from "@/store/tabs";
import { useWorkspaceStore } from "@/store/workspace";
import { errorMessage } from "./actions";

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
