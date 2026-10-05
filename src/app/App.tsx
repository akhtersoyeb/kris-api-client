import { Toaster } from "sonner";
import { AppLayout } from "@/app/AppLayout";
import { ThemeProvider } from "@/app/ThemeProvider";
import { DialogHost } from "@/features/workspace/DialogHost";
import { WelcomeScreen } from "@/features/workspace/WelcomeScreen";
import { useThemeStore } from "@/store/theme";
import { useWorkspaceStore } from "@/store/workspace";
import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { handleExternalChange } from "@/features/workspace/save";
import { startSessionAutosave } from "@/features/workspace/session";

export function App() {
  const isOpen = useWorkspaceStore((s) => s.info !== null);
  const isDark = useThemeStore((s) => s.isDark);

  useEffect(() => startSessionAutosave(), []);

  useEffect(() => {
    const unlisten = listen<{ paths: string[] }>("workspace-changed", (e) => {
      void handleExternalChange(e.payload.paths);
    });
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, []);

  return (
    <ThemeProvider>
      {isOpen ? <AppLayout /> : <WelcomeScreen />}
      <DialogHost />
      <Toaster theme={isDark ? "dark" : "light"} richColors closeButton />
    </ThemeProvider>
  );
}
