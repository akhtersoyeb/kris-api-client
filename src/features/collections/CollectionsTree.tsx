import { useMemo } from "react";
import { Virtuoso } from "react-virtuoso";
import { Notice } from "@/components/Notice";
import { Button } from "@/components/ui/button";
import { newCollection } from "@/features/workspace/actions";
import { useTabsStore } from "@/store/tabs";
import { useWorkspaceStore } from "@/store/workspace";
import { TreeRow } from "./TreeRow";
import { visibleNodes } from "./tree";

export function CollectionsTree() {
  const nodes = useWorkspaceStore((s) => s.nodes);
  const expanded = useWorkspaceStore((s) => s.expanded);
  const activePath = useTabsStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.path ?? null);
  const visible = useMemo(() => visibleNodes(nodes, expanded), [nodes, expanded]);

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
    <Virtuoso
      className="h-full"
      data={visible}
      computeItemKey={(_, node) => node.path}
      itemContent={(_, node) => <TreeRow node={node} active={node.path === activePath} />}
    />
  );
}
