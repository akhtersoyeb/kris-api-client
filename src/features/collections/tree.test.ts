import { describe, expect, it } from "vitest";
import type { NodeEntry, NodeKind } from "@/lib/bindings";
import { visibleNodes } from "./tree";
import { resolveDrop } from "./tree";

const p = (name: string) => nodes.find((n) => n.name === name)!.path;

describe("resolveDrop", () => {
  it("reorders within a parent", () => {
    expect(resolveDrop(nodes, p("Get"), p("List"), "before")).toMatchObject({
      parentPath: "collections/api",
      order: ["Auth", "Get", "List"],
    });
  });

  it("moves into a folder as its last child", () => {
    expect(resolveDrop(nodes, p("List"), p("Auth"), "inside")).toMatchObject({
      parentPath: "collections/api/auth",
      order: ["Login", "List"],
    });
  });

  it("refuses to move a folder into its own subtree", () => {
    expect(resolveDrop(nodes, p("Auth"), p("Login"), "inside")).toBeNull();
  });

  it("reorders collections and never nests them", () => {
    expect(resolveDrop(nodes, p("Other"), p("API"), "before")).toMatchObject({
      parentPath: "",
      order: ["Other", "API"],
    });
    expect(resolveDrop(nodes, p("API"), p("Other"), "inside")).toMatchObject({
      parentPath: "",
      order: ["Other", "API"],
    });
  });

  it("forces requests dropped beside a collection to go inside it", () => {
    expect(resolveDrop(nodes, p("Get"), p("Other"), "before")).toMatchObject({
      parentPath: "collections/other",
      order: ["Get"],
    });
  });

  it("returns null when nothing would change", () => {
    expect(resolveDrop(nodes, p("Get"), p("List"), "after")).toBeNull();
  });
});

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
