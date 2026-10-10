import { useId, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VariableInput } from "@/features/variables/VariableInput";
import type { KeyValueRow } from "@/store/request-draft";

interface Props {
  rows: KeyValueRow[];
  onChange: (rows: KeyValueRow[]) => void;
  /** Autocomplete options for the key column. */
  suggestions?: readonly string[];
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}

export function KeyValueEditor({
  rows,
  onChange,
  suggestions,
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
}: Props) {
  const listId = useId();
  const [pendingId, setPendingId] = useState(() => crypto.randomUUID());

  const display = [
    ...rows.map((row) => ({ row, phantom: false })),
    { row: { id: pendingId, key: "", value: "", enabled: true }, phantom: true },
  ];

  function patch(row: KeyValueRow, phantom: boolean, change: Partial<KeyValueRow>) {
    if (phantom) {
      onChange([...rows, { ...row, ...change }]);
      setPendingId(crypto.randomUUID());
    } else {
      onChange(rows.map((r) => (r.id === row.id ? { ...r, ...change } : r)));
    }
  }

  return (
    <div className="flex flex-col gap-1 p-3">
      {suggestions && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
      {display.map(({ row, phantom }) => (
        <div key={row.id} className="flex items-center gap-2">
          <input
            type="checkbox"
            aria-label="Enabled"
            className={phantom ? "invisible size-4" : "size-4"}
            checked={row.enabled}
            onChange={(e) => patch(row, phantom, { enabled: e.target.checked })}
          />
          <VariableInput
            list={suggestions ? listId : undefined}
            value={row.key}
            placeholder={keyPlaceholder}
            spellCheck={false}
            className="flex-1"
            inputClassName="h-8 font-mono"
            onChange={(key) => patch(row, phantom, { key })}
          />
          <VariableInput
            value={row.value}
            placeholder={valuePlaceholder}
            spellCheck={false}
            className="flex-1"
            inputClassName="h-8 font-mono"
            onChange={(value) => patch(row, phantom, { value })}
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Remove row"
            className={phantom ? "invisible size-8" : "size-8"}
            onClick={() => onChange(rows.filter((r) => r.id !== row.id))}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}
