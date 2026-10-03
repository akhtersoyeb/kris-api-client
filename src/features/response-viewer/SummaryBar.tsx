import type { ResponseSpec } from "@/lib/bindings";
import { formatBytes, formatDuration, statusTone, type StatusTone } from "@/lib/format";
import { cn } from "@/lib/utils";

const TONES: Record<StatusTone, string> = {
  info: "bg-muted text-foreground",
  success: "bg-green-600/15 text-green-700 dark:text-green-400",
  redirect: "bg-blue-600/15 text-blue-700 dark:text-blue-400",
  client: "bg-amber-600/15 text-amber-700 dark:text-amber-400",
  server: "bg-red-600/15 text-red-700 dark:text-red-400",
};

export function SummaryBar({ response }: { response: ResponseSpec }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-3 py-2 text-xs">
      <span className={cn("rounded px-2 py-0.5 font-semibold", TONES[statusTone(response.status)])}>
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
