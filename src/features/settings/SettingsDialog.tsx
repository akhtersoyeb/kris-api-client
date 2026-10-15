import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { clearHistoryFlow, refreshHistory } from "@/features/history/actions";
import type { AppSettings, HistorySettings } from "@/lib/bindings";
import { ipc } from "@/lib/ipc";
import { useUiStore } from "@/store/ui";

const RETENTION = [
  { value: 0, label: "Forever (until the entry limit)" },
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: 365, label: "1 year" },
];
const MAX_ENTRIES = [100, 500, 1000, 5000, 10000];

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <input
        type="checkbox"
        className="mt-1 size-4"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: number;
  options: Array<{ value: number; label: string }>;
  onChange: (v: number) => void;
}) {
  // A hand-edited settings file may hold a value that isn't in the list; keep it selectable.
  const all = options.some((o) => o.value === value)
    ? options
    : [...options, { value, label: String(value) }];
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <select
        className="h-8 rounded-md border bg-background px-2 text-sm"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {all.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SettingsDialog() {
  const open = useUiStore((s) => s.settingsOpen);
  const setOpen = useUiStore((s) => s.setSettingsOpen);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    if (open) void ipc.getAppSettings().then(setSettings);
  }, [open]);

  async function update(change: Partial<HistorySettings>) {
    if (!settings) return;
    const next: AppSettings = { ...settings, history: { ...settings.history, ...change } };
    setSettings(next); // optimistic
    try {
      setSettings(await ipc.setAppSettings(next)); // the backend returns the clamped values
      void refreshHistory(); // retention changes may have removed entries
    } catch (e) {
      toast.error("Could not save settings", {
        description: e instanceof Error ? e.message : String(e),
      });
      setSettings(settings);
    }
  }

  const history = settings?.history;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Changes are saved as you make them.</DialogDescription>
        </DialogHeader>
        {!history ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <section className="space-y-4">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              History
            </h3>
            <Toggle
              label="Record request history"
              hint="Turning this off keeps existing entries; it only stops new ones."
              checked={history.enabled}
              onChange={(enabled) => void update({ enabled })}
            />
            <Toggle
              label="Redact secrets"
              hint="Masks Authorization, Cookie and API-key style headers, URL credentials, sensitive query parameters and form fields. Values that are only {{variables}} are kept."
              checked={history.redactSecrets}
              onChange={(redactSecrets) => void update({ redactSecrets })}
            />
            <Toggle
              label="Save request bodies"
              hint="Needed to reopen a request exactly. JSON and raw bodies are saved as written, so a password typed into one would be stored. Turn this off if that matters."
              checked={history.storeBodies}
              onChange={(storeBodies) => void update({ storeBodies })}
            />
            <Select
              label="Keep entries for"
              value={history.retentionDays}
              options={RETENTION}
              onChange={(retentionDays) => void update({ retentionDays })}
            />
            <Select
              label="Keep at most"
              value={history.maxEntries}
              options={MAX_ENTRIES.map((n) => ({
                value: n,
                label: `${n.toLocaleString()} entries`,
              }))}
              onChange={(maxEntries) => void update({ maxEntries })}
            />
            <div className="flex items-center justify-between border-t pt-4">
              <p className="text-xs text-muted-foreground">
                History is stored on this computer, per workspace, outside your workspace folder.
              </p>
              <Button variant="outline" size="sm" onClick={() => void clearHistoryFlow()}>
                Clear history
              </Button>
            </div>
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}
