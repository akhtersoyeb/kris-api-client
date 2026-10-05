import { ChevronDown, ChevronRight, Folder, FolderOpen, Library } from "lucide-react";
import type { NodeEntry } from "@/lib/bindings";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/store/workspace";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  deleteNode,
  duplicateNode,
  newFolder,
  newRequest,
  openRequest,
  renameNode,
} from "@/features/workspace/actions";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { DropContext } from "./drop-context";
import { useContext } from "react";

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
  const drag = useDraggable({ id: node.path });
  const dropZone = useDroppable({ id: node.path });
  const drop = useContext(DropContext);
  const indicator = drop?.overPath === node.path ? drop.position : null;

  const row = (
    <div
      ref={(el) => {
        drag.setNodeRef(el);
        dropZone.setNodeRef(el);
      }}
      {...drag.attributes}
      {...drag.listeners}
      role="treeitem"
      aria-selected={active}
      aria-expanded={isContainer ? expanded : undefined}
      className={cn(
        "flex h-7 cursor-pointer items-center gap-1.5 pr-2 text-sm select-none hover:bg-accent",
        active && "bg-accent",
        drag.isDragging && "opacity-40",
        indicator === "before" && "shadow-[inset_0_2px_0_0_var(--primary)]",
        indicator === "after" && "shadow-[inset_0_-2px_0_0_var(--primary)]",
        indicator === "inside" && "bg-primary/15 ring-1 ring-primary ring-inset",
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

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      {/* Stops the menu stealing focus back from the dialog it opens. */}
      <ContextMenuContent className="w-48" onCloseAutoFocus={(e) => e.preventDefault()}>
        {isContainer ? (
          <>
            <ContextMenuItem onSelect={() => void newRequest(node)}>New request</ContextMenuItem>
            <ContextMenuItem onSelect={() => void newFolder(node)}>New folder</ContextMenuItem>
            <ContextMenuSeparator />
          </>
        ) : (
          <ContextMenuItem onSelect={() => void openRequest(node.path)}>Open</ContextMenuItem>
        )}
        <ContextMenuItem onSelect={() => void renameNode(node)}>Rename</ContextMenuItem>
        <ContextMenuItem onSelect={() => void duplicateNode(node)}>Duplicate</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={() => void deleteNode(node)}
        >
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
