import type { ResponseSpec } from "@/lib/bindings";
import { formatBytes, formatDuration, statusTone } from "@/lib/format";
import { cn } from "@/lib/utils";
import { STATUS_TONE_CLASSES } from "@/lib/status-colors";

export function SummaryBar({ response }: { response: ResponseSpec }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-3 py-2 text-xs">
      <span
        className={cn(
          "rounded px-2 py-0.5 font-semibold",
          STATUS_TONE_CLASSES[statusTone(response.status)],
        )}
      >
        {response.status} {response.statusText}
      </span>
      <span>
        Time: <b>{formatDuration(response.durationMs)}</b>
      </span>
      <span>
        Size: <b>{formatBytes(response.sizeBytes)}</b>
      </span>
      <span className="text-muted-foreground">{response.httpVersion}</span>
    </div>
  );
}
