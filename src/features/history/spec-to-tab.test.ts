import { describe, expect, it } from "vitest";
import type { RequestSpec } from "@/lib/bindings";
import { hasRedactions, specToTabPatch } from "./spec-to-tab";

const base = (patch: Partial<RequestSpec> = {}): RequestSpec => ({
  method: "POST",
  url: "https://x.dev/a?b=1",
  headers: [{ key: "Accept", value: "*/*", enabled: true }],
  body: { type: "none" },
  settings: { timeoutMs: 5000, followRedirects: false },
  auth: { type: "inherit" },
  ...patch,
});

describe("specToTabPatch", () => {
  it("rebuilds params from the URL and keeps headers and settings", () => {
    const patch = specToTabPatch(base());
    expect(patch.params?.map((p) => [p.key, p.value])).toEqual([["b", "1"]]);
    expect(patch.headers?.[0]).toMatchObject({ key: "Accept", value: "*/*", enabled: true });
    expect(patch.settings).toEqual({ timeoutMs: 5000, followRedirects: false });
    expect(patch.body?.mode).toBe("none");
  });

  it("maps each body type", () => {
    expect(specToTabPatch(base({ body: { type: "json", content: "{}" } })).body).toMatchObject({
      mode: "json",
      json: "{}",
    });
    expect(
      specToTabPatch(base({ body: { type: "raw", content: "x", mime: "text/html" } })).body,
    ).toMatchObject({
      mode: "raw",
      raw: "x",
      rawMime: "text/html",
    });
    const form = specToTabPatch(
      base({ body: { type: "formUrlEncoded", fields: [{ key: "a", value: "1", enabled: true }] } }),
    ).body;
    expect(form?.mode).toBe("form");
    expect(form?.form[0]).toMatchObject({ key: "a", value: "1" });
  });

  it("falls back to GET for unknown methods", () => {
    expect(specToTabPatch(base({ method: "BREW" })).method).toBe("GET");
  });
});

describe("hasRedactions", () => {
  it("finds the placeholder in the url, headers and form fields", () => {
    expect(hasRedactions(base())).toBe(false);
    expect(hasRedactions(base({ url: "https://x.dev?token=[redacted]" }))).toBe(true);
    expect(
      hasRedactions(
        base({ headers: [{ key: "Authorization", value: "[redacted]", enabled: true }] }),
      ),
    ).toBe(true);
    expect(
      hasRedactions(
        base({
          body: {
            type: "formUrlEncoded",
            fields: [{ key: "p", value: "[redacted]", enabled: true }],
          },
        }),
      ),
    ).toBe(true);
  });

  it("keeps auth, and flags redacted auth values", () => {
    const spec = base({ auth: { type: "basic", username: "me", password: "[redacted]" } });
    expect(specToTabPatch(spec).auth).toEqual(spec.auth);
    expect(hasRedactions(spec)).toBe(true);
  });
});
