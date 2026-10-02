import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ipc } from "@/lib/ipc";

export function App() {
  const [out, setOut] = useState("");

  async function run(message: string) {
    try {
      const res = await ipc.ping(message);
      setOut(`${res.reply} (v${res.appVersion})`);
    } catch (e) {
      setOut(e instanceof Error ? `${e.name}: ${e.message}` : String(e));
    }
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
      <div className="flex gap-2">
        <Button onClick={() => run("hello")}>Ping</Button>
        <Button variant="outline" onClick={() => run("")}>
          Ping (empty, should fail)
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">{out}</p>
    </div>
  );
}
