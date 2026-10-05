import { Toaster } from "sonner";
import { AppLayout } from "@/app/AppLayout";
import { ThemeProvider } from "@/app/ThemeProvider";
import { DialogHost } from "@/features/workspace/DialogHost";
import { WelcomeScreen } from "@/features/workspace/WelcomeScreen";
import { useThemeStore } from "@/store/theme";
import { useWorkspaceStore } from "@/store/workspace";

export function App() {
  const isOpen = useWorkspaceStore((s) => s.info !== null);
  const isDark = useThemeStore((s) => s.isDark);
  return (
    <ThemeProvider>
      {isOpen ? <AppLayout /> : <WelcomeScreen />}
      <DialogHost />
      <Toaster theme={isDark ? "dark" : "light"} richColors closeButton />
    </ThemeProvider>
  );
}
