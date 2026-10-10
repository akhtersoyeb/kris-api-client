import { useState } from "react";
import { Eye, EyeOff, Lock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { isValidVariableName } from "./tokens";
import { newVariableRow, type VariableRow } from "./variable-rows";
import { VariableInput } from "./VariableInput";

interface Props {
  rows: VariableRow[];
  onChange: (rows: VariableRow[]) => void;
}

export function VariablesEditor({ rows, onChange }: Props) {
  // The blank row at the end keeps a stable id, so typing in it creates a real row without losing focus.
  const [pendingId, setPendingId] = useState(() => crypto.randomUUID());
  const [revealed, setRevealed] = useState<Record<string, true>>({});

  const display = [
    ...rows.map((row) => ({ row, phantom: false })),
    { row: newVariableRow({ id: pendingId }), phantom: true },
  ];

  function patch(row: VariableRow, phantom: boolean, change: Partial<VariableRow>) {
    if (phantom) {
      onChange([...rows, { ...row, ...change }]);
      setPendingId(crypto.randomUUID());
    } else {
      onChange(rows.map((r) => (r.id === row.id ? { ...r, ...change } : r)));
    }
  }

  return (
    <div className="flex flex-col gap-1 p-3">
      {display.map(({ row, phantom }) => {
        const invalid = row.key.trim() !== "" && !isValidVariableName(row.key.trim());
        const masked = row.secret && !revealed[row.id];
        return (
          <div key={row.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              aria-label="Enabled"
              className={cn("size-4", phantom && "invisible")}
              checked={row.enabled}
              onChange={(e) => patch(row, phantom, { enabled: e.target.checked })}
            />
            <Input
              value={row.key}
              placeholder="Variable name"
              spellCheck={false}
              aria-invalid={invalid}
              title={
                invalid
                  ? "Use letters, digits and _ - . only. A leading $ is reserved for built-ins."
                  : undefined
              }
              className={cn("h-8 w-48 font-mono", invalid && "border-destructive")}
              onChange={(e) => patch(row, phantom, { key: e.target.value })}
            />
            {masked ? (
              <Input
                type="password"
                autoComplete="off"
                value={row.value}
                placeholder="Secret value"
                className="h-8 flex-1 font-mono"
                onChange={(e) => patch(row, phantom, { value: e.target.value })}
              />
            ) : (
              <VariableInput
                value={row.value}
                placeholder="Value"
                spellCheck={false}
                className="flex-1"
                inputClassName="h-8 font-mono"
                onChange={(value) => patch(row, phantom, { value })}
              />
            )}
            <Button
              variant="ghost"
              size="icon"
              className={cn("size-8", !row.secret && "invisible")}
              aria-label={revealed[row.id] ? "Hide value" : "Show value"}
              onClick={() =>
                setRevealed((r) => {
                  const { [row.id]: shown, ...rest } = r;
                  return shown ? rest : { ...r, [row.id]: true };
                })
              }
            >
              {revealed[row.id] ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "size-8",
                phantom && "invisible",
                row.secret ? "text-primary" : "text-muted-foreground",
              )}
              aria-pressed={row.secret}
              aria-label="Secret"
              title={
                row.secret
                  ? "Secret: stored in the system keychain, never written to files"
                  : "Not secret: saved in plain text in the workspace file"
              }
              onClick={() => patch(row, phantom, { secret: !row.secret })}
            >
              <Lock className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn("size-8", phantom && "invisible")}
              aria-label="Remove variable"
              onClick={() => onChange(rows.filter((r) => r.id !== row.id))}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
