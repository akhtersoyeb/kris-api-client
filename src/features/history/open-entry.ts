import { toast } from "sonner";
import type { HistoryEntry } from "@/lib/bindings";
import { ipc } from "@/lib/ipc";
import { useTabsStore } from "@/store/tabs";
import { hasRedactions, specToTabPatch } from "./spec-to-tab";

/** Opens a past request as a new unsaved tab, ready to edit and send again. */
export async function openHistoryEntry(entry: HistoryEntry) {
  try {
    const spec = await ipc.getHistoryRequest(entry.id);
    useTabsStore.getState().openTab(specToTabPatch(spec));
    if (hasRedactions(spec)) {
      toast.info("Some values were redacted when this was recorded", {
        description: "Fill in the [redacted] values before sending.",
      });
    }
  } catch (e) {
    toast.error("Could not open this entry", {
      description: e instanceof Error ? e.message : String(e),
    });
  }
}
