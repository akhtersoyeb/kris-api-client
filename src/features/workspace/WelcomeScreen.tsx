import { useEffect } from "react";
import { FolderOpen, FolderPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspaceStore } from "@/store/workspace";
import {
  chooseAndOpenWorkspace,
  createWorkspaceFlow,
  forgetRecent,
  openWorkspaceAt,
  refreshRecents,
} from "./actions";

export function WelcomeScreen() {
  const recents = useWorkspaceStore((s) => s.recents);
  useEffect(() => {
    void refreshRecents();
  }, []);

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 bg-background p-8 text-foreground">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">API Client</h1>
        <p className="text-sm text-muted-foreground">
          Everything stays on your machine, in plain files.
        </p>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => void createWorkspaceFlow()}>
          <FolderPlus className="size-4" /> New workspace
        </Button>
        <Button variant="outline" onClick={() => void chooseAndOpenWorkspace()}>
          <FolderOpen className="size-4" /> Open workspace
        </Button>
      </div>
      {recents.length > 0 && (
        <div className="w-full max-w-md">
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Recent
          </h2>
          <ul className="divide-y rounded-md border">
            {recents.map((r) => (
              <li key={r.path} className="flex items-center">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 flex-col px-3 py-2 text-left hover:bg-accent"
                  onClick={() => void openWorkspaceAt(r.path)}
                >
                  <span className="truncate text-sm font-medium">{r.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{r.path}</span>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="mr-1 size-7"
                  aria-label={`Remove ${r.name} from recent`}
                  onClick={() => void forgetRecent(r.path)}
                >
                  <X className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
