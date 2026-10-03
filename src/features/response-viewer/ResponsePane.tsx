import { Loader2 } from "lucide-react";
import { Notice } from "@/components/Notice";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useResponsesStore } from "@/store/responses";
import { useTabsStore } from "@/store/tabs";
import { ErrorView } from "./ErrorView";
import { HeadersTable } from "./HeadersTable";
import { ResponseBody } from "./ResponseBody";
import { SummaryBar } from "./SummaryBar";

export function ResponsePane() {
  const tabId = useTabsStore((s) => s.activeTabId);
  const run = useResponsesStore((s) => (tabId ? s.runs[tabId] : undefined));

  if (!run) return <Notice>Send a request to see the response.</Notice>;
  if (run.phase === "sending") {
    return (
      <Notice>
        <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
        Sending request...
      </Notice>
    );
  }
  if (run.phase === "error") return <ErrorView error={run.error} />;

  const { response } = run;
  return (
    <div className="flex h-full flex-col">
      <SummaryBar response={response} />
      <Tabs defaultValue="body" className="flex min-h-0 flex-1 flex-col gap-0">
        <TabsList className="mx-3 mt-2 w-fit">
          <TabsTrigger value="body">Body</TabsTrigger>
          <TabsTrigger value="headers">Headers ({response.headers.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="body" className="min-h-0 flex-1">
          <ResponseBody response={response} />
        </TabsContent>
        <TabsContent value="headers" className="min-h-0 overflow-auto">
          <HeadersTable headers={response.headers} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
