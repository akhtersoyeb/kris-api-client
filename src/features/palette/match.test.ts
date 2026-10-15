import { describe, expect, it } from "vitest";
import { matchesQuery } from "./match";

describe("matchesQuery", () => {
  it("requires every word, in any order, ignoring case", () => {
    expect(matchesQuery("user get", "GET Users list")).toBe(true);
    expect(matchesQuery("users post", "GET Users list")).toBe(false);
  });

  it("matches everything for an empty query", () => {
    expect(matchesQuery("   ", "anything")).toBe(true);
  });
});
