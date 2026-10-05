import type { NodeEntry } from "@/lib/bindings";

/** The flat depth-first list minus anything under a collapsed container. */
export function visibleNodes(nodes: NodeEntry[], expanded: Record<string, true>): NodeEntry[] {
  const out: NodeEntry[] = [];
  let hiddenBelow: number | null = null;
  for (const node of nodes) {
    if (hiddenBelow !== null && node.depth > hiddenBelow) continue;
    hiddenBelow = null;
    out.push(node);
    if (node.kind !== "request" && !expanded[node.path]) hiddenBelow = node.depth;
  }
  return out;
}

/** Collections and folders as "Collection / Folder" choices for the Save dialog. */
export function containerOptions(nodes: NodeEntry[]): Array<{ path: string; label: string }> {
  const byPath = new Map(nodes.map((n) => [n.path, n]));
  return nodes
    .filter((n) => n.kind !== "request")
    .map((n) => {
      const names: string[] = [];
      for (
        let c: NodeEntry | undefined = n;
        c;
        c = c.parentPath ? byPath.get(c.parentPath) : undefined
      ) {
        names.unshift(c.name);
      }
      return { path: n.path, label: names.join(" / ") };
    });
}

export type DropPosition = "before" | "after" | "inside";

export interface DropResult {
  parentPath: string; // "" = top level (reordering collections)
  order: string[]; // the parent's full child id list after the drop
  overPath: string;
  position: DropPosition; // normalized, used for the indicator
}

/**
 * Turns "dragged X over Y at before/inside/after" into a legal move, or null if it isn't one.
 * Collections only reorder among themselves, and nothing moves into its own subtree.
 */
export function resolveDrop(
  nodes: NodeEntry[],
  activePath: string,
  overPath: string,
  position: DropPosition,
): DropResult | null {
  const active = nodes.find((n) => n.path === activePath);
  const over = nodes.find((n) => n.path === overPath);
  if (!active || !over || active.path === over.path) return null;
  if (over.path.startsWith(`${active.path}/`)) return null;

  let pos = position;
  if (over.kind === "request" && pos === "inside") pos = "after";
  if (active.kind === "collection") {
    if (over.kind !== "collection") return null;
    if (pos === "inside") pos = "after";
  } else if (over.kind === "collection") {
    pos = "inside"; // requests and folders can't sit beside collections
  }

  const parentPath = pos === "inside" ? over.path : (over.parentPath ?? "");
  const siblings = nodes.filter((n) => (n.parentPath ?? "") === parentPath && n.id !== active.id);
  let index = siblings.length;
  if (pos !== "inside") {
    const at = siblings.findIndex((n) => n.id === over.id);
    index = pos === "before" ? at : at + 1;
  }
  const order = siblings.map((n) => n.id);
  order.splice(index, 0, active.id);

  const before = nodes
    .filter((n) => (n.parentPath ?? "") === (active.parentPath ?? ""))
    .map((n) => n.id);
  if ((active.parentPath ?? "") === parentPath && before.join() === order.join()) return null; // no change
  return { parentPath, order, overPath, position: pos };
}
