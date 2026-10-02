import { Button } from "@/components/ui/button";

export function App() {
  return (
    <div className="flex h-screen items-center justify-center gap-4 bg-background text-foreground">
      <h1 className="text-xl font-semibold">API Client</h1>
      <Button>Hello</Button>
    </div>
  );
}
