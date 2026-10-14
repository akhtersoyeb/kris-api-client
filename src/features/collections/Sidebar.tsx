import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HistoryPanel } from "@/features/history/HistoryPanel";
import { newCollection } from "@/features/workspace/actions";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/store/workspace";
import { CollectionsTree } from "./CollectionsTree";

type View = "collections" | "history";

export function Sidebar() {
  const [view, setView] = useState<View>("collections");
  const warnings = useWorkspaceStore((s) => s.warnings);

  const tab = (value: View, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={view === value}
      onClick={() => setView(value)}
      className={cn(
        "rounded px-2 py-1 text-xs font-semibold tracking-wide uppercase",
        view === value
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );

  return (
    <aside className="flex h-full flex-col text-sm">
      <div className="flex items-center justify-between px-2 py-2" role="tablist">
        <div className="flex gap-1">
          {tab("collections", "Collections")}
          {tab("history", "History")}
        </div>
        {view === "collections" && (
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            aria-label="New collection"
            onClick={() => void newCollection()}
          >
            <Plus className="size-4" />
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1">
        {view === "collections" ? <CollectionsTree /> : <HistoryPanel />}
      </div>
      {view === "collections" && warnings.length > 0 && (
        <div title={warnings.join("\n")} className="border-t bg-amber-500/10 px-3 py-1.5 text-xs">
          {warnings.length} file{warnings.length === 1 ? "" : "s"} couldn't be read. Hover for
          details.
        </div>
      )}
    </aside>
  );
}
