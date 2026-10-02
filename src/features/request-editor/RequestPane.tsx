import { useTabsStore } from "@/store/tabs";

export function RequestPane() {
  const tab = useTabsStore((s) => s.tabs.find((t) => t.id === s.activeTabId));

  if (!tab) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No request open
      </div>
    );
  }
  return (
    <div className="p-3 text-sm">
      <span className="font-semibold">{tab.method}</span> {tab.url || "(empty url)"}
    </div>
  );
}
