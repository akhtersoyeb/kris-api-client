import { Sidebar } from "@/features/collections/Sidebar";
import { RequestPane } from "@/features/request-editor/RequestPane";
import { TabBar } from "@/features/request-editor/TabBar";
import { ResponsePane } from "@/features/response-viewer/ResponsePane";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ThemeToggle } from "@/app/ThemeToggle";
import { CommandPalette } from "@/features/palette/CommandPalette";
import { Button } from "@/components/ui/button";
import { closeWorkspace } from "@/features/workspace/actions";
import { useWorkspaceStore } from "@/store/workspace";
import { useEffect } from "react";
import { saveActiveTab } from "@/features/workspace/save";

export function AppLayout() {
  const workspaceName = useWorkspaceStore((s) => s.info?.name ?? "");

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveActiveTab();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex h-10 items-center justify-between border-b px-3">
        <span className="text-sm font-semibold">{workspaceName}</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => void closeWorkspace()}
          >
            Close workspace
          </Button>
          <ThemeToggle />
        </div>
      </header>

      <ResizablePanelGroup orientation="horizontal" className="flex-1">
        <ResizablePanel defaultSize={22} minSize={14}>
          <Sidebar />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={78}>
          <div className="flex h-full flex-col">
            <TabBar />
            <CommandPalette />
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
