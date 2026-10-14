import { X } from "lucide-react";
import type { HistoryEntry } from "@/lib/bindings";
import { formatBytes, formatDuration, statusTone } from "@/lib/format";
import { METHOD_COLORS } from "@/lib/method-colors";
import { STATUS_TONE_CLASSES } from "@/lib/status-colors";
import { cn } from "@/lib/utils";
import { deleteHistoryEntry } from "./actions";

export function HistoryItem({
  entry,
  onOpen,
}: {
  entry: HistoryEntry;
  onOpen: (entry: HistoryEntry) => void;
}) {
  const failed = entry.status === null;
  const time = new Date(entry.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const details = [
    time,
    entry.durationMs !== null ? formatDuration(entry.durationMs) : null,
    entry.sizeBytes !== null ? formatBytes(entry.sizeBytes) : null,
    entry.environment,
  ].filter(Boolean);

  return (
    <div
      role="button"
      tabIndex={0}
      title={entry.error ?? entry.url}
      className="group flex cursor-pointer flex-col gap-0.5 px-3 py-1.5 hover:bg-accent"
      onClick={() => onOpen(entry)}
      onKeyDown={(e) => e.key === "Enter" && onOpen(entry)}
    >
      <div className="flex items-center gap-2 text-xs">
        <span
          className={cn(
            "w-11 shrink-0 font-semibold",
            METHOD_COLORS[entry.method] ?? "text-muted-foreground",
          )}
        >
          {entry.method}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono">
          {entry.url.replace(/^https?:\/\//, "")}
        </span>
        <button
          type="button"
          aria-label="Delete entry"
          className="rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-background"
          onClick={(e) => {
            e.stopPropagation();
            void deleteHistoryEntry(entry.id);
          }}
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="flex items-center gap-2 pl-13 text-[11px] text-muted-foreground">
        <span
          className={cn(
            "rounded px-1.5 font-semibold",
            STATUS_TONE_CLASSES[failed ? "server" : statusTone(entry.status ?? 0)],
          )}
        >
          {failed ? "ERR" : entry.status}
        </span>
        <span className="truncate">{failed ? entry.error : details.join(" · ")}</span>
      </div>
    </div>
  );
}
