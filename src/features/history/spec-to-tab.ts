import { syncParamsFromUrl } from "@/features/request-editor/params";
import type { RequestBody, RequestSpec } from "@/lib/bindings";
import {
  HTTP_METHODS,
  defaultBody,
  newRow,
  type BodyDraft,
  type HttpMethod,
} from "@/store/request-draft";
import type { TabPatch } from "@/store/tabs";

/** The placeholder the backend writes in place of a redacted value. */
export const REDACTED = "[redacted]";

function toBody(body: RequestBody): BodyDraft {
  switch (body.type) {
    case "none":
      return defaultBody();
    case "json":
      return { ...defaultBody(), mode: "json", json: body.content };
    case "raw":
      return { ...defaultBody(), mode: "raw", raw: body.content, rawMime: body.mime };
    case "formUrlEncoded":
      return { ...defaultBody(), mode: "form", form: body.fields.map((f) => newRow(f)) };
  }
}

export function specToTabPatch(spec: RequestSpec): TabPatch {
  const known = (HTTP_METHODS as readonly string[]).includes(spec.method);
  return {
    method: known ? (spec.method as HttpMethod) : "GET",
    url: spec.url,
    params: syncParamsFromUrl(spec.url, []),
    headers: spec.headers.map((h) => newRow(h)),
    body: toBody(spec.body),
    settings: {
      timeoutMs: spec.settings.timeoutMs,
      followRedirects: spec.settings.followRedirects,
    },
  };
}

export function hasRedactions(spec: RequestSpec): boolean {
  const { body } = spec;
  return (
    spec.url.includes(REDACTED) ||
    spec.headers.some((h) => h.value === REDACTED) ||
    (body.type === "formUrlEncoded" && body.fields.some((f) => f.value === REDACTED))
  );
}
