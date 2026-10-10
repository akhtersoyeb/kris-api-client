import { describe, expect, it } from "vitest";
import type { VariableInfo } from "@/lib/bindings";
import { summarize } from "./describe";
import { findVariables, isValidVariableName, splitSegments } from "./tokens";
import { newVariableRow, toRows, toVariables } from "./variable-rows";

describe("findVariables", () => {
  it("finds names, allowing spaces around them and $ built-ins", () => {
    const text = "{{base}}/u/{{ id }}?t={{$timestamp}}";
    expect(findVariables(text).map((t) => t.name)).toEqual(["base", "id", "$timestamp"]);
    expect(findVariables(text)[1]).toMatchObject({ start: 11, end: 19 });
  });

  it("ignores things that aren't variables", () => {
    expect(findVariables("{{ not a var }} {{}} {{ }} {x} {{a b}}")).toEqual([]);
  });
});

describe("splitSegments", () => {
  it("splits text around tokens without losing characters", () => {
    const segments = splitSegments("a {{x}} b{{y}}");
    expect(segments).toEqual([
      { text: "a ", name: null },
      { text: "{{x}}", name: "x" },
      { text: " b", name: null },
      { text: "{{y}}", name: "y" },
    ]);
    expect(segments.map((s) => s.text).join("")).toBe("a {{x}} b{{y}}");
  });
});

describe("isValidVariableName", () => {
  it("rejects spaces, braces and the reserved $ prefix", () => {
    expect(isValidVariableName("base_url")).toBe(true);
    expect(isValidVariableName("api.v2-host")).toBe(true);
    for (const bad of ["", "a b", "{x}", "$uuid"]) expect(isValidVariableName(bad)).toBe(false);
  });
});

describe("summarize", () => {
  const info = (patch: Partial<VariableInfo>): VariableInfo => ({
    name: "x",
    scope: "environment",
    secret: false,
    value: "raw",
    ...patch,
  });

  it("covers each kind", () => {
    expect(summarize(undefined, null).kind).toBe("undefined");
    expect(summarize(info({ secret: true }), null)).toMatchObject({ kind: "secret", value: null });
    expect(
      summarize(info({ scope: "builtin" }), { text: "uuid", unresolved: [], cyclic: [] }),
    ).toMatchObject({ kind: "builtin", value: "uuid" });
    expect(summarize(info({}), { text: "resolved", unresolved: [], cyclic: [] })).toMatchObject({
      kind: "defined",
      scope: "Environment",
      value: "resolved",
    });
    expect(summarize(info({}), { text: "{{x}}", unresolved: [], cyclic: ["x"] }).kind).toBe(
      "cyclic",
    );
  });

  it("shows the raw value until a preview arrives, and reports undefined nested names", () => {
    expect(summarize(info({}), null).value).toBe("raw");
    expect(
      summarize(info({}), { text: "a{{y}}", unresolved: ["y"], cyclic: [] }).unresolved,
    ).toEqual(["y"]);
  });
});

describe("variable rows", () => {
  it("drops ids and blank names, and trims keys", () => {
    const rows = [
      newVariableRow({ key: " host ", value: "a", secret: true }),
      newVariableRow({ key: " ", value: "x" }),
    ];
    expect(toVariables(rows)).toEqual([{ key: "host", value: "a", enabled: true, secret: true }]);
    expect(toRows(toVariables(rows))).toHaveLength(1);
  });
});
