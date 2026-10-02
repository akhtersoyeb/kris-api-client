import { AppLayout } from "@/app/AppLayout";
import { ThemeProvider } from "@/app/ThemeProvider";

export function App() {
  return (
    <ThemeProvider>
      <AppLayout />
    </ThemeProvider>
  );
}
