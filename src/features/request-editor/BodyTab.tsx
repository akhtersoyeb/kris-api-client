import { Button } from "@/components/ui/button";
import { CodeEditor } from "@/components/CodeEditor";
import { useTabsStore, type RequestTab } from "@/store/tabs";
import type { BodyDraft, BodyMode } from "@/store/request-draft";
import { KeyValueEditor } from "./KeyValueEditor";

const MODES: Array<{ value: BodyMode; label: string }> = [
  { value: "none", label: "None" },
  { value: "json", label: "JSON" },
  { value: "raw", label: "Raw" },
  { value: "form", label: "Form (urlencoded)" },
];

const RAW_TYPES = [
  { mime: "text/plain", language: "plaintext" },
  { mime: "application/xml", language: "xml" },
  { mime: "text/html", language: "html" },
  { mime: "application/javascript", language: "javascript" },
];

export function BodyTab({ tab }: { tab: RequestTab }) {
  const updateTab = useTabsStore((s) => s.updateTab);
  const { body } = tab;
  const setBody = (patch: Partial<BodyDraft>) => updateTab(tab.id, { body: { ...body, ...patch } });
  const rawLanguage = RAW_TYPES.find((t) => t.mime === body.rawMime)?.language ?? "plaintext";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 px-3 py-2">
        {MODES.map((m) => (
          <Button
            key={m.value}
            size="sm"
            variant={body.mode === m.value ? "secondary" : "ghost"}
            className="h-7"
            onClick={() => setBody({ mode: m.value })}
          >
            {m.label}
          </Button>
        ))}
        {body.mode === "raw" && (
          <select
            aria-label="Content type"
            className="ml-2 h-7 rounded-md border bg-background px-2 text-xs"
            value={body.rawMime}
            onChange={(e) => setBody({ rawMime: e.target.value })}
          >
            {RAW_TYPES.map((t) => (
              <option key={t.mime} value={t.mime}>
                {t.mime}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="min-h-0 flex-1">
        {body.mode === "none" && (
          <p className="p-4 text-sm text-muted-foreground">This request has no body.</p>
        )}
        {body.mode === "json" && (
          <CodeEditor
            highlightVariables
            path={`${tab.id}/body.json`}
            language="json"
            value={body.json}
            onChange={(json) => setBody({ json })}
          />
        )}
        {body.mode === "raw" && (
          <CodeEditor
            highlightVariables
            path={`${tab.id}/body.raw`}
            language={rawLanguage}
            value={body.raw}
            onChange={(raw) => setBody({ raw })}
          />
        )}
        {body.mode === "form" && (
          <div className="h-full overflow-auto">
            <KeyValueEditor rows={body.form} onChange={(form) => setBody({ form })} />
          </div>
        )}
      </div>
    </div>
  );
}
