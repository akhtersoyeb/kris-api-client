import { toast } from "sonner";
import { ipc } from "@/lib/ipc";
import { useDialogs } from "@/store/dialogs";
import { useHistoryStore } from "@/store/history";

const PAGE = 50;
let latest = 0;
let searchTimer: ReturnType<typeof setTimeout> | undefined;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Loads the first page (reset) or the next one. A newer request makes older replies irrelevant. */
export async function loadHistory({ reset }: { reset: boolean }) {
  const initial = useHistoryStore.getState();
  if (initial.loading && !reset) return;
  const mine = ++latest;
  useHistoryStore.setState({ loading: true });
  try {
    const query = initial.query.trim();
    if (query) {
      const entries = await ipc.searchHistory(query, 100);
      if (mine === latest) useHistoryStore.setState({ entries, hasMore: false });
    } else {
      const offset = reset ? 0 : initial.entries.length;
      const page = await ipc.listHistory(PAGE, offset);
      if (mine === latest) {
        const current = useHistoryStore.getState().entries;
        useHistoryStore.setState({
          entries: reset ? page : [...current, ...page],
          hasMore: page.length === PAGE,
        });
      }
    }
  } catch {
    /* no workspace open yet, or a transient error: keep what is shown */
  } finally {
    if (mine === latest) useHistoryStore.setState({ loading: false });
  }
}

export const refreshHistory = () => loadHistory({ reset: true });

export function setHistoryQuery(query: string) {
  useHistoryStore.setState({ query });
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void loadHistory({ reset: true }), 200);
}

export function resetHistory() {
  useHistoryStore.setState({ entries: [], query: "", hasMore: false, loading: false });
}

export async function deleteHistoryEntry(id: number) {
  try {
    await ipc.deleteHistoryEntry(id);
    useHistoryStore.setState((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
  } catch (e) {
    toast.error("Could not delete the entry", { description: message(e) });
  }
}

export async function clearHistoryFlow() {
  const ok = await useDialogs.getState().askConfirm({
    title: "Clear history?",
    description:
      "This deletes every history entry for this workspace. Saved requests are not affected.",
    confirmLabel: "Clear history",
    destructive: true,
  });
  if (!ok) return;
  try {
    await ipc.clearHistory();
    await refreshHistory();
  } catch (e) {
    toast.error("Could not clear history", { description: message(e) });
  }
}
