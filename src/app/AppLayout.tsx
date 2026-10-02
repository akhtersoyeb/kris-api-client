import { useEffect } from "react";
import { Sidebar } from "@/features/collections/Sidebar";
import { RequestPane } from "@/features/request-editor/RequestPane";
import { TabBar } from "@/features/request-editor/TabBar";
import { ResponsePane } from "@/features/response-viewer/ResponsePane";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useTabsStore } from "@/store/tabs";
import { ThemeToggle } from "@/app/ThemeToggle";

export function AppLayout() {
  // Start with one empty tab. The getState check keeps StrictMode's double effect from opening two.
  useEffect(() => {
    if (useTabsStore.getState().tabs.length === 0) useTabsStore.getState().openTab();
  }, []);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex h-10 items-center justify-between border-b px-3">
        <span className="text-sm font-semibold">API Client</span>
        <ThemeToggle />
      </header>

      <ResizablePanelGroup orientation="horizontal" className="flex-1">
        <ResizablePanel defaultSize={22} minSize={14} maxSize={40}>
          <Sidebar />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={78}>
          <div className="flex h-full flex-col">
            <TabBar />
            <ResizablePanelGroup orientation="vertical" className="flex-1">
              <ResizablePanel defaultSize={50} minSize={20}>
                <RequestPane />
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={50} minSize={15}>
                <ResponsePane />
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
