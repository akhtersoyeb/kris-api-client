import { useMemo, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import { Notice } from "@/components/Notice";
import { Button } from "@/components/ui/button";
import { newCollection, moveNode } from "@/features/workspace/actions";
import { useTabsStore } from "@/store/tabs";
import { useWorkspaceStore } from "@/store/workspace";
import { TreeRow } from "./TreeRow";
import { visibleNodes, resolveDrop, type DropPosition, type DropResult } from "./tree";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragMoveEvent,
} from "@dnd-kit/core";
import type { NodeEntry } from "@/lib/bindings";
import { DropContext } from "./drop-context";

const sameDrop = (a: DropResult | null, b: DropResult | null) =>
  a?.overPath === b?.overPath && a?.position === b?.position && a?.parentPath === b?.parentPath;

export function CollectionsTree() {
  const nodes = useWorkspaceStore((s) => s.nodes);
  const expanded = useWorkspaceStore((s) => s.expanded);
  const activePath = useTabsStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.path ?? null);
  const visible = useMemo(() => visibleNodes(nodes, expanded), [nodes, expanded]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [activeNode, setActiveNode] = useState<NodeEntry | null>(null);
  const [drop, setDrop] = useState<DropResult | null>(null);

  function onDragMove({ active, over }: DragMoveEvent) {
    const dragged = active.rect.current.translated;
    let next: DropResult | null = null;
    if (over && dragged) {
      const rel = (dragged.top + dragged.height / 2 - over.rect.top) / over.rect.height;
      const position: DropPosition = rel < 0.25 ? "before" : rel > 0.75 ? "after" : "inside";
      next = resolveDrop(nodes, String(active.id), String(over.id), position);
    }
    setDrop((prev) => (sameDrop(prev, next) ? prev : next));
  }

  function reset() {
    setActiveNode(null);
    setDrop(null);
  }

  function onDragEnd() {
    const result = drop;
    const node = activeNode;
    reset();
    if (result && node) void moveNode(node, result.parentPath, result.order);
  }

  if (nodes.length === 0) {
    return (
      <Notice>
        <p className="mb-2">No collections yet.</p>
        <Button size="sm" onClick={() => void newCollection()}>
          New collection
        </Button>
      </Notice>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => setActiveNode(nodes.find((n) => n.path === e.active.id) ?? null)}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={reset}
    >
      <DropContext.Provider value={drop}>
        <Virtuoso
          className="h-full"
          data={visible}
          computeItemKey={(_, node) => node.path}
          itemContent={(_, node) => <TreeRow node={node} active={node.path === activePath} />}
        />
      </DropContext.Provider>
      <DragOverlay dropAnimation={null}>
        {activeNode && (
          <div className="rounded border bg-background px-2 py-1 text-xs shadow">
            {activeNode.name}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
