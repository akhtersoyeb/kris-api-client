import { describe, expect, it } from "vitest";
import type { NodeEntry, NodeKind } from "@/lib/bindings";
import { visibleNodes } from "./tree";

export const node = (
  kind: NodeKind,
  name: string,
  path: string,
  parentPath: string | null,
  depth: number,
): NodeEntry => ({
  kind,
  id: name,
  name,
  path,
  parentPath,
  depth,
  method: kind === "request" ? "GET" : null,
});

export const nodes = [
  node("collection", "API", "collections/api", null, 0),
  node("folder", "Auth", "collections/api/auth", "collections/api", 1),
  node("request", "Login", "collections/api/auth/login.request.json", "collections/api/auth", 2),
  node("request", "List", "collections/api/list.request.json", "collections/api", 1),
  node("request", "Get", "collections/api/get.request.json", "collections/api", 1),
  node("collection", "Other", "collections/other", null, 0),
];

const names = (list: NodeEntry[]) => list.map((n) => n.name);

describe("visibleNodes", () => {
  it("hides everything under collapsed containers", () => {
    expect(names(visibleNodes(nodes, {}))).toEqual(["API", "Other"]);
    expect(names(visibleNodes(nodes, { "collections/api": true }))).toEqual([
      "API",
      "Auth",
      "List",
      "Get",
      "Other",
    ]);
    expect(
      names(visibleNodes(nodes, { "collections/api": true, "collections/api/auth": true })),
    ).toEqual(["API", "Auth", "Login", "List", "Get", "Other"]);
  });
});
