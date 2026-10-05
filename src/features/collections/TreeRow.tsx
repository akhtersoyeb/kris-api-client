import { ChevronDown, ChevronRight, Folder, FolderOpen, Library } from "lucide-react";
import type { NodeEntry } from "@/lib/bindings";
import { cn } from "@/lib/utils";
import { openRequest } from "@/features/workspace/actions";
import { useWorkspaceStore } from "@/store/workspace";

const METHOD_COLORS: Record<string, string> = {
  GET: "text-green-600 dark:text-green-400",
  POST: "text-amber-600 dark:text-amber-400",
  PUT: "text-blue-600 dark:text-blue-400",
  PATCH: "text-purple-600 dark:text-purple-400",
  DELETE: "text-red-600 dark:text-red-400",
};

export function TreeRow({ node, active }: { node: NodeEntry; active: boolean }) {
  const expanded = useWorkspaceStore((s) => !!s.expanded[node.path]);
  const toggle = useWorkspaceStore((s) => s.toggle);
  const isContainer = node.kind !== "request";

  return (
    <div
      role="treeitem"
      aria-selected={active}
      aria-expanded={isContainer ? expanded : undefined}
      className={cn(
        "flex h-7 cursor-pointer items-center gap-1.5 pr-2 text-sm select-none hover:bg-accent",
        active && "bg-accent",
      )}
      style={{ paddingLeft: 8 + node.depth * 14 }}
      onClick={() => (isContainer ? toggle(node.path) : void openRequest(node.path))}
    >
      {isContainer ? (
        expanded ? (
          <ChevronDown className="size-3.5 shrink-0" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0" />
        )
      ) : (
        <span className="w-3.5 shrink-0" />
      )}
      {node.kind === "request" ? (
        <span
          className={cn(
            "w-10 shrink-0 text-[10px] font-semibold",
            METHOD_COLORS[node.method ?? ""] ?? "text-muted-foreground",
          )}
        >
          {(node.method ?? "").slice(0, 6)}
        </span>
      ) : node.kind === "collection" ? (
        <Library className="size-4 shrink-0 text-muted-foreground" />
      ) : expanded ? (
        <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
      ) : (
        <Folder className="size-4 shrink-0 text-muted-foreground" />
      )}
      <span className="truncate">{node.name}</span>
    </div>
  );
}
