import { Save, Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HTTP_METHODS, useTabsStore, type HttpMethod, type RequestTab } from "@/store/tabs";
import { syncParamsFromUrl } from "./params";
import { useResponsesStore } from "@/store/responses";
import { saveTab } from "@/features/workspace/save";

export function UrlBar({ tab }: { tab: RequestTab }) {
  const updateTab = useTabsStore((s) => s.updateTab);
  const sending = useResponsesStore((s) => s.runs[tab.id]?.phase === "sending");
  const send = useResponsesStore((s) => s.send);
  const cancel = useResponsesStore((s) => s.cancel);

  return (
    <form
      className="flex gap-2 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!sending) void send(tab.id);
      }}
    >
      <Select
        value={tab.method}
        onValueChange={(m) => updateTab(tab.id, { method: m as HttpMethod })}
      >
        <SelectTrigger className="w-32 font-semibold" aria-label="HTTP method">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {HTTP_METHODS.map((m) => (
            <SelectItem key={m} value={m}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        value={tab.url}
        placeholder="https://api.example.com/users?limit=10"
        spellCheck={false}
        aria-label="Request URL"
        className="flex-1 font-mono"
        onChange={(e) =>
          updateTab(tab.id, {
            url: e.target.value,
            params: syncParamsFromUrl(e.target.value, tab.params),
          })
        }
      />

      <Button
        type="button"
        variant="outline"
        disabled={!!tab.path && !tab.dirty}
        onClick={() => void saveTab(tab.id)}
      >
        <Save className="size-4" /> Save
      </Button>

      {sending ? (
        <Button type="button" variant="destructive" onClick={() => void cancel(tab.id)}>
          <Square className="size-4" /> Cancel
        </Button>
      ) : (
        <Button type="submit" disabled={!tab.url.trim()}>
          <Send className="size-4" /> Send
        </Button>
      )}
    </form>
  );
}
