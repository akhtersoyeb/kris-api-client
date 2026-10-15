import { useEffect, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { openHistoryEntry } from "@/features/history/open-entry";
import { closeWorkspace, newCollection, openRequest } from "@/features/workspace/actions";
import { requestCloseTab, saveActiveTab } from "@/features/workspace/save";
import type { HistoryEntry } from "@/lib/bindings";
import { ipc } from "@/lib/ipc";
import { METHOD_COLORS } from "@/lib/method-colors";
import { cn } from "@/lib/utils";
import { useTabsStore } from "@/store/tabs";
import { useThemeStore } from "@/store/theme";
import { useUiStore } from "@/store/ui";
import { useVariablesStore } from "@/store/variables";
import { useWorkspaceStore } from "@/store/workspace";
import { matchesQuery } from "./match";

interface Cmd {
  id: string;
  label: string;
  run: () => void;
}

/** Mounted only while the palette is open, so the query and results reset by themselves on close. */
function PaletteContent({ close }: { close: () => void }) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<HistoryEntry[]>([]);

  const nodes = useWorkspaceStore((s) => s.nodes);
  const environments = useVariablesStore((s) => s.environments);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const trimmed = query.trim();

  // History comes from the backend (debounced). State is only set in the promise callbacks.
  useEffect(() => {
    if (trimmed === "") return;
    let live = true;
    const timer = setTimeout(() => {
      ipc
        .searchHistory(trimmed, 8)
        .then((rows) => live && setFound(rows))
        .catch(() => live && setFound([]));
    }, 150);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [trimmed]);

  // Derived, not stored: an empty query never shows history results.
  const history = trimmed === "" ? [] : found;

  const setTheme = useThemeStore.getState().setTheme;
  const setActiveEnv = useVariablesStore.getState().setActive;
  const commands: Cmd[] = [
    { id: "new-request", label: "New request", run: () => useTabsStore.getState().openTab() },
    ...(activeTabId
      ? [
          {
            id: "close-tab",
            label: "Close current tab",
            run: () => void requestCloseTab(activeTabId),
          },
        ]
      : []),
    { id: "save", label: "Save request", run: () => void saveActiveTab() },
    { id: "new-collection", label: "New collection", run: () => void newCollection() },
    {
      id: "variables",
      label: "Manage variables...",
      run: () => useVariablesStore.getState().openManager(),
    },
    { id: "no-env", label: "Use no environment", run: () => setActiveEnv(null) },
    ...environments.map((e) => ({
      id: `env-${e.id}`,
      label: `Use environment: ${e.name}`,
      run: () => setActiveEnv(e.id),
    })),
    { id: "theme-light", label: "Theme: Light", run: () => setTheme("light") },
    { id: "theme-dark", label: "Theme: Dark", run: () => setTheme("dark") },
    { id: "theme-system", label: "Theme: System", run: () => setTheme("system") },
    {
      id: "settings",
      label: "Open settings",
      run: () => useUiStore.getState().setSettingsOpen(true),
    },
    { id: "close-workspace", label: "Close workspace", run: () => void closeWorkspace() },
  ];

  const searching = trimmed !== "";
  const shownCommands = commands
    .filter((c) => matchesQuery(query, c.label))
    .slice(0, searching ? 6 : commands.length);
  const requests = searching
    ? nodes
        .filter(
          (n) =>
            n.kind === "request" && matchesQuery(query, `${n.name} ${n.path} ${n.method ?? ""}`),
        )
        .slice(0, 8)
    : [];

  const run = (action: () => void) => () => {
    close();
    action();
  };

  return (
    <Command shouldFilter={false}>
      <CommandInput
        placeholder="Search commands, requests and history..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        {shownCommands.length > 0 && (
          <CommandGroup heading="Commands">
            {shownCommands.map((c) => (
              <CommandItem key={c.id} value={`cmd-${c.id}`} onSelect={run(c.run)}>
                {c.label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {requests.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Saved requests">
              {requests.map((n) => (
                <CommandItem
                  key={n.path}
                  value={`req-${n.path}`}
                  onSelect={run(() => void openRequest(n.path))}
                >
                  <span
                    className={cn(
                      "w-12 shrink-0 text-[11px] font-semibold",
                      METHOD_COLORS[n.method ?? ""] ?? "text-muted-foreground",
                    )}
                  >
                    {n.method}
                  </span>
                  <span className="truncate">{n.name}</span>
                  <span className="ml-auto truncate text-xs text-muted-foreground">
                    {n.path.replace(/^collections\//, "")}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        {history.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="History">
              {history.map((h) => (
                <CommandItem
                  key={h.id}
                  value={`hist-${h.id}`}
                  onSelect={run(() => void openHistoryEntry(h))}
                >
                  <span
                    className={cn(
                      "w-12 shrink-0 text-[11px] font-semibold",
                      METHOD_COLORS[h.method] ?? "text-muted-foreground",
                    )}
                  >
                    {h.method}
                  </span>
                  <span className="truncate font-mono text-xs">
                    {h.url.replace(/^https?:\/\//, "")}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">{h.status ?? "ERR"}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </Command>
  );
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-xl">
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Search commands, saved requests and history.
        </DialogDescription>
        <PaletteContent close={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
