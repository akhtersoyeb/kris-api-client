import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { newCollection } from "@/features/workspace/actions";
import { useWorkspaceStore } from "@/store/workspace";
import { CollectionsTree } from "./CollectionsTree";

export function Sidebar() {
  const warnings = useWorkspaceStore((s) => s.warnings);
  return (
    <aside className="flex h-full flex-col text-sm">
      <div className="flex items-center justify-between px-3 py-2">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Collections
        </h2>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          aria-label="New collection"
          onClick={() => void newCollection()}
        >
          <Plus className="size-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <CollectionsTree />
      </div>
      {warnings.length > 0 && (
        <div title={warnings.join("\n")} className="border-t bg-amber-500/10 px-3 py-1.5 text-xs">
          {warnings.length} file{warnings.length === 1 ? "" : "s"} couldn't be read. Hover for
          details.
        </div>
      )}
    </aside>
  );
}
