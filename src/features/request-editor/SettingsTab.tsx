import { Input } from "@/components/ui/input";
import { useTabsStore, type RequestTab } from "@/store/tabs";
import type { SettingsDraft } from "@/store/request-draft";

export function SettingsTab({ tab }: { tab: RequestTab }) {
  const updateTab = useTabsStore((s) => s.updateTab);
  const set = (patch: Partial<SettingsDraft>) =>
    updateTab(tab.id, { settings: { ...tab.settings, ...patch } });

  return (
    <div className="flex max-w-sm flex-col gap-4 p-4 text-sm">
      <label className="flex flex-col gap-1">
        <span className="font-medium">Timeout (ms)</span>
        <Input
          type="number"
          min={0}
          step={1000}
          value={tab.settings.timeoutMs}
          onChange={(e) => set({ timeoutMs: Number(e.target.value) })}
        />
        <span className="text-xs text-muted-foreground">0 disables the timeout.</span>
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          className="size-4"
          checked={tab.settings.followRedirects}
          onChange={(e) => set({ followRedirects: e.target.checked })}
        />
        Follow redirects
      </label>
    </div>
  );
}
