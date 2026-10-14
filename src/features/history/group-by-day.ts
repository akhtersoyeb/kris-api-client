import type { HistoryEntry } from "@/lib/bindings";

export type HistoryRow =
  { type: "header"; key: string; label: string } | { type: "entry"; entry: HistoryEntry };

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function dayLabel(ts: number, now: Date): string {
  const date = new Date(ts);
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

/** Entries are newest first, so a new header appears whenever the day changes. */
export function groupByDay(entries: HistoryEntry[], now: Date = new Date()): HistoryRow[] {
  const rows: HistoryRow[] = [];
  let current = "";
  for (const entry of entries) {
    const label = dayLabel(entry.ts, now);
    if (label !== current) {
      rows.push({ type: "header", key: `h-${label}`, label });
      current = label;
    }
    rows.push({ type: "entry", entry });
  }
  return rows;
}
