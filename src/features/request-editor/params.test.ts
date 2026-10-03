import { describe, expect, it } from "vitest";
import { newRow } from "@/store/request-draft";
import { applyParams, parseQuery, syncParamsFromUrl } from "./params";

describe("parseQuery", () => {
  it("parses pairs and decodes values", () => {
    expect(parseQuery("https://x.dev/a?q=hello%20world&flag&n=1+2#top")).toEqual([
      { key: "q", value: "hello world" },
      { key: "flag", value: "" },
      { key: "n", value: "1 2" },
    ]);
  });

  it("returns nothing without a query", () => {
    expect(parseQuery("https://x.dev/a")).toEqual([]);
  });
});

describe("applyParams", () => {
  it("rewrites the query, skips disabled rows and keeps the hash", () => {
    const rows = [
      newRow({ key: "a", value: "1 2" }),
      newRow({ key: "b", value: "x", enabled: false }),
      newRow({ key: "c", value: "{{token}}" }),
    ];
    expect(applyParams("https://x.dev/p?old=1#h", rows)).toBe(
      "https://x.dev/p?a=1%202&c={{token}}#h",
    );
  });

  it("drops the ? when nothing is enabled", () => {
    expect(applyParams("https://x.dev/p?a=1", [])).toBe("https://x.dev/p");
  });
});

describe("syncParamsFromUrl", () => {
  it("reuses ids and keeps disabled rows", () => {
    const a = newRow({ key: "a", value: "1" });
    const off = newRow({ key: "z", value: "9", enabled: false });
    const rows = syncParamsFromUrl("https://x.dev?a=2&b=3", [a, off]);
    expect(rows.map((r) => [r.key, r.value, r.enabled])).toEqual([
      ["a", "2", true],
      ["b", "3", true],
      ["z", "9", false],
    ]);
    expect(rows[0]?.id).toBe(a.id);
  });
});
