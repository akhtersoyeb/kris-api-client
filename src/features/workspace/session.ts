import { ipc } from "@/lib/ipc";
import { isDirty } from "@/store/request-doc";
import { useTabsStore, type RequestTab } from "@/store/tabs";
import { useWorkspaceStore } from "@/store/workspace";
import { syncTabWithDisk } from "./save";

type SessionTab = Omit<RequestTab, "conflict">; // conflicts are re-detected on restore

interface Session {
  version: 1;
  activeTabId: string | null;
  expanded: string[];
  tabs: SessionTab[];
}

let timer: ReturnType<typeof setTimeout> | undefined;
let restoring = false;

function build(): Session {
  const { tabs, activeTabId } = useTabsStore.getState();
  return {
    version: 1,
    activeTabId,
    expanded: Object.keys(useWorkspaceStore.getState().expanded),
    tabs: tabs.map(({ conflict: _conflict, ...rest }) => rest),
  };
}

async function write() {
  const info = useWorkspaceStore.getState().info;
  if (!info || restoring) return;
  try {
    await ipc.saveSession(info.id, JSON.stringify(build()));
  } catch {
    /* best effort: recovery data must never disturb editing */
  }
}

export function scheduleSessionSave() {
  clearTimeout(timer);
  timer = setTimeout(() => void write(), 700);
}

export async function flushSession() {
  clearTimeout(timer);
  await write();
}

/** Call once at startup. Returns the unsubscribe function. */
export function startSessionAutosave(): () => void {
  const stopTabs = useTabsStore.subscribe(scheduleSessionSave);
  const stopWorkspace = useWorkspaceStore.subscribe((s, prev) => {
    if (s.expanded !== prev.expanded) scheduleSessionSave();
  });
  return () => {
    stopTabs();
    stopWorkspace();
  };
}

function isSessionTab(x: unknown): x is SessionTab {
  const t = x as Partial<SessionTab> | null;
  return (
    !!t &&
    typeof t.id === "string" &&
    typeof t.url === "string" &&
    typeof t.title === "string" &&
    Array.isArray(t.params) &&
    Array.isArray(t.headers) &&
    !!t.body &&
    !!t.settings
  );
}

function parse(raw: string): Session | null {
  try {
    const data = JSON.parse(raw) as Partial<Session>;
    if (data.version !== 1 || !Array.isArray(data.tabs)) return null;
    return {
      version: 1,
      activeTabId: typeof data.activeTabId === "string" ? data.activeTabId : null,
      expanded: Array.isArray(data.expanded)
        ? data.expanded.filter((p) => typeof p === "string")
        : [],
      tabs: data.tabs.filter(isSessionTab),
    };
  } catch {
    return null; // corrupt recovery file: start fresh rather than fail
  }
}

export async function restoreSession(workspaceId: string) {
  restoring = true;
  try {
    const raw = await ipc.loadSession(workspaceId).catch(() => null);
    const session = raw ? parse(raw) : null;
    if (!session || session.tabs.length === 0) return;

    const tabs = session.tabs.map((t) => {
      const tab: RequestTab = { ...t, conflict: false, dirty: false };
      return { ...tab, dirty: isDirty(tab) };
    });
    const active = tabs.some((t) => t.id === session.activeTabId)
      ? session.activeTabId
      : (tabs[0]?.id ?? null);
    useTabsStore.getState().replaceAll(tabs, active);

    const known = new Set(useWorkspaceStore.getState().nodes.map((n) => n.path));
    useWorkspaceStore.getState().setExpanded(session.expanded.filter((p) => known.has(p)));

    // Files may have changed while the app was closed: reload clean tabs, flag conflicts on dirty ones.
    await Promise.all(tabs.filter((t) => t.path).map((t) => syncTabWithDisk(t.id)));
  } finally {
    restoring = false;
    scheduleSessionSave();
  }
}
