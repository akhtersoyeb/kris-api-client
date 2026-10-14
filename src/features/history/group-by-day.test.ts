import { describe, expect, it } from "vitest";
import type { HistoryEntry } from "@/lib/bindings";
import { dayLabel, groupByDay } from "./group-by-day";

const now = new Date(2026, 9, 12, 15, 0);
const entry = (id: number, when: Date): HistoryEntry => ({
  id,
  ts: when.getTime(),
  method: "GET",
  url: `https://x.dev/${id}`,
  status: 200,
  durationMs: 5,
  sizeBytes: 1,
  error: null,
  environment: null,
  requestPath: null,
});

describe("groupByDay", () => {
  it("inserts a header whenever the day changes", () => {
    const rows = groupByDay(
      [
        entry(4, new Date(2026, 9, 12, 14)),
        entry(3, new Date(2026, 9, 12, 9)),
        entry(2, new Date(2026, 9, 11, 23, 59)),
        entry(1, new Date(2026, 9, 8)),
      ],
      now,
    );
    const headers = rows
      .filter((r) => r.type === "header")
      .map((r) => (r.type === "header" ? r.label : ""));
    expect(headers).toHaveLength(3);
    expect(headers.slice(0, 2)).toEqual(["Today", "Yesterday"]);
    expect(rows.filter((r) => r.type === "entry")).toHaveLength(4);
  });

  it("treats future timestamps (clock skew) as today", () => {
    expect(dayLabel(new Date(2026, 9, 13).getTime(), now)).toBe("Today");
  });

  it("returns nothing for no entries", () => {
    expect(groupByDay([], now)).toEqual([]);
  });
});
