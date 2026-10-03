import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTabsStore } from "@/store/tabs";
import type { KeyValueRow } from "@/store/request-draft";
import { COMMON_HEADERS } from "./headers";
import { KeyValueEditor } from "./KeyValueEditor";
import { applyParams } from "./params";
import { SettingsTab } from "./SettingsTab";
import { UrlBar } from "./UrlBar";

const active = (rows: KeyValueRow[]) => rows.filter((r) => r.enabled && r.key !== "").length;
const badge = (n: number) => (n > 0 ? ` (${n})` : "");

export function RequestPane() {
  const tab = useTabsStore((s) => s.tabs.find((t) => t.id === s.activeTabId));
  const updateTab = useTabsStore((s) => s.updateTab);

  if (!tab) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No request open
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <UrlBar tab={tab} />
      <Tabs defaultValue="params" className="flex min-h-0 flex-1 flex-col gap-0">
        <TabsList className="mx-3 w-fit">
          <TabsTrigger value="params">Params{badge(active(tab.params))}</TabsTrigger>
          <TabsTrigger value="headers">Headers{badge(active(tab.headers))}</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="params" className="min-h-0 overflow-auto">
          <KeyValueEditor
            rows={tab.params}
            onChange={(rows) =>
              updateTab(tab.id, { params: rows, url: applyParams(tab.url, rows) })
            }
          />
        </TabsContent>
        <TabsContent value="headers" className="min-h-0 overflow-auto">
          <KeyValueEditor
            rows={tab.headers}
            suggestions={COMMON_HEADERS}
            onChange={(headers) => updateTab(tab.id, { headers })}
          />
        </TabsContent>
        <TabsContent value="settings" className="min-h-0 overflow-auto">
          <SettingsTab tab={tab} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
