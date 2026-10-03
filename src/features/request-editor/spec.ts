import type { KeyValue, RequestBody, RequestSpec } from "@/lib/bindings";
import type { BodyDraft, KeyValueRow } from "@/store/request-draft";
import type { RequestTab } from "@/store/tabs";

const toKeyValues = (rows: KeyValueRow[]): KeyValue[] =>
  rows
    .filter((r) => r.key.trim() !== "")
    .map((r) => ({ key: r.key.trim(), value: r.value, enabled: r.enabled }));

export function toRequestBody(body: BodyDraft): RequestBody {
  switch (body.mode) {
    case "none":
      return { type: "none" };
    case "json":
      return { type: "json", content: body.json };
    case "raw":
      return { type: "raw", content: body.raw, mime: body.rawMime };
    case "form":
      return { type: "formUrlEncoded", fields: toKeyValues(body.form) };
  }
}

export function buildRequestSpec(tab: RequestTab): RequestSpec {
  const timeout = Number.isFinite(tab.settings.timeoutMs) ? Math.round(tab.settings.timeoutMs) : 0;
  return {
    method: tab.method,
    url: tab.url.trim(),
    headers: toKeyValues(tab.headers),
    body: toRequestBody(tab.body),
    settings: { timeoutMs: Math.max(0, timeout), followRedirects: tab.settings.followRedirects },
  };
}
