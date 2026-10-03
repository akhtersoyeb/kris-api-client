import { AlertCircle } from "lucide-react";
import type { RunError } from "@/store/responses";

const COPY: Record<string, { title: string; hint: string }> = {
  InvalidInput: { title: "Invalid request", hint: "Check the URL, method and headers." },
  Timeout: {
    title: "Request timed out",
    hint: "Raise the timeout in the Settings tab, or check the server.",
  },
  Network: {
    title: "Could not complete the request",
    hint: "Check the URL, your connection, and that the server is running.",
  },
};

export function ErrorView({ error }: { error: RunError }) {
  const copy = COPY[error.kind] ?? { title: "Something went wrong", hint: "" };
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-xl space-y-2">
        <div className="flex items-center gap-2 font-medium text-destructive">
          <AlertCircle className="size-4" /> {copy.title}
        </div>
        <pre className="rounded-md bg-muted p-3 text-xs break-words whitespace-pre-wrap">
          {error.message}
        </pre>
        {copy.hint && <p className="text-xs text-muted-foreground">{copy.hint}</p>}
      </div>
    </div>
  );
}
