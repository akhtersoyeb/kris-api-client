import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { CodeEditor } from "@/components/CodeEditor";
import { Notice } from "@/components/Notice";
import type { ResponseSpec } from "@/lib/bindings";
import { VIEW_LIMIT, detectLanguage, formatJsonText } from "./body-format";

type Mode = "pretty" | "raw" | "preview";

function Preview({ response }: { response: ResponseSpec }) {
  const ct = (response.contentType ?? "").toLowerCase().split(";")[0] ?? "";
  const utf8 = response.bodyEncoding === "utf8";

  if (ct === "image/svg+xml" && utf8) {
    return <ImagePreview src={`data:image/svg+xml;utf8,${encodeURIComponent(response.body)}`} />;
  }
  if (ct.startsWith("image/") && !utf8) {
    return <ImagePreview src={`data:${ct};base64,${response.body}`} />;
  }
  if (ct.includes("html") && utf8) {
    // Empty sandbox: no scripts, no forms, no same-origin access.
    return (
      <iframe
        title="Response preview"
        sandbox=""
        srcDoc={response.body}
        className="h-full w-full bg-white"
      />
    );
  }
  return <Notice>No preview available for this content type.</Notice>;
}

function ImagePreview({ src }: { src: string }) {
  return (
    <div className="flex h-full items-center justify-center overflow-auto p-3">
      <img alt="Response preview" src={src} className="max-h-full max-w-full object-contain" />
    </div>
  );
}

export function ResponseBody({ response }: { response: ResponseSpec }) {
  const [mode, setMode] = useState<Mode>("pretty");
  const binary = response.bodyEncoding === "base64";
  const tooBig = response.body.length > VIEW_LIMIT;
  const language = useMemo(
    () => detectLanguage(response.contentType, response.body),
    [response.contentType, response.body],
  );
  const pretty = useMemo(
    () => (language === "json" && !tooBig ? formatJsonText(response.body) : response.body),
    [language, tooBig, response.body],
  );

  let content;
  if (mode === "preview") {
    content = <Preview response={response} />;
  } else if (binary) {
    content = <Notice>Binary response. It can't be shown as text (use Preview for images).</Notice>;
  } else if (response.body === "") {
    content = <Notice>This response has no body.</Notice>;
  } else if (tooBig) {
    // Monaco struggles with very large text; a plain textarea stays responsive.
    content = (
      <textarea
        readOnly
        value={response.body}
        className="h-full w-full resize-none bg-transparent p-3 font-mono text-xs outline-none"
      />
    );
  } else {
    content = (
      <CodeEditor
        readOnly
        wordWrap
        language={mode === "pretty" ? language : "plaintext"}
        value={mode === "pretty" ? pretty : response.body}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b px-3 py-1">
        {(["pretty", "raw", "preview"] as const).map((m) => (
          <Button
            key={m}
            size="sm"
            variant={mode === m ? "secondary" : "ghost"}
            className="h-7 capitalize"
            onClick={() => setMode(m)}
          >
            {m}
          </Button>
        ))}
        {response.bodyTruncated && (
          <span className="ml-2 text-xs text-amber-600">Body cut off at 50 MB</span>
        )}
      </div>
      <div className="min-h-0 flex-1">{content}</div>
    </div>
  );
}
