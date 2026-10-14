import { useEffect, useMemo } from "react";
import { Trash2 } from "lucide-react";
import { Virtuoso } from "react-virtuoso";
import { Notice } from "@/components/Notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useHistoryStore } from "@/store/history";
import { clearHistoryFlow, loadHistory, refreshHistory, setHistoryQuery } from "./actions";
import { groupByDay } from "./group-by-day";
import { HistoryItem } from "./HistoryItem";
import { openHistoryEntry } from "./open-entry";

export function HistoryPanel() {
  const entries = useHistoryStore((s) => s.entries);
  const query = useHistoryStore((s) => s.query);
  const hasMore = useHistoryStore((s) => s.hasMore);
  const rows = useMemo(() => groupByDay(entries), [entries]);

  useEffect(() => {
    void refreshHistory();
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 px-3 pb-2">
        <Input
          value={query}
          placeholder="Search history..."
          aria-label="Search history"
          spellCheck={false}
          className="h-8 text-xs"
          onChange={(e) => setHistoryQuery(e.target.value)}
        />
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Clear history"
          onClick={() => void clearHistoryFlow()}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        {rows.length === 0 ? (
          <Notice>
            {query.trim() ? "No matching requests." : "Requests you send will appear here."}
          </Notice>
        ) : (
          <Virtuoso
            className="h-full"
            data={rows}
            computeItemKey={(_, row) => (row.type === "header" ? row.key : String(row.entry.id))}
            endReached={() => hasMore && void loadHistory({ reset: false })}
            itemContent={(_, row) =>
              row.type === "header" ? (
                <h3 className="px-3 pt-3 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  {row.label}
                </h3>
              ) : (
                <HistoryItem entry={row.entry} onOpen={(entry) => void openHistoryEntry(entry)} />
              )
            }
          />
        )}
      </div>
    </div>
  );
}
