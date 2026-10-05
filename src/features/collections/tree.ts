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
