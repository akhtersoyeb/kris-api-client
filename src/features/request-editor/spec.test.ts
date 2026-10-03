import { describe, expect, it } from "vitest";
import { defaultBody, defaultSettings, newRow } from "@/store/request-draft";
import type { RequestTab } from "@/store/tabs";
import { buildRequestSpec } from "./spec";

const makeTab = (patch: Partial<RequestTab> = {}): RequestTab => ({
  id: "t1",
  title: "New Request",
  method: "GET",
  url: "",
  dirty: false,
  params: [],
  headers: [],
  body: defaultBody(),
  settings: defaultSettings(),
  ...patch,
});

describe("buildRequestSpec", () => {
  it("trims, drops blank header rows and keeps the enabled flag", () => {
    const spec = buildRequestSpec(
      makeTab({
        method: "POST",
        url: " https://x.dev/api ",
        headers: [
          newRow({ key: " Accept ", value: "*/*" }),
          newRow({ key: "", value: "skip" }),
          newRow({ key: "X-Off", value: "1", enabled: false }),
        ],
        body: { ...defaultBody(), mode: "json", json: '{"a":1}' },
      }),
    );
    expect(spec.url).toBe("https://x.dev/api");
    expect(spec.headers).toEqual([
      { key: "Accept", value: "*/*", enabled: true },
      { key: "X-Off", value: "1", enabled: false },
    ]);
    expect(spec.body).toEqual({ type: "json", content: '{"a":1}' });
  });

  it("sanitises a bad timeout", () => {
    const spec = buildRequestSpec(
      makeTab({ settings: { timeoutMs: Number.NaN, followRedirects: false } }),
    );
    expect(spec.settings).toEqual({ timeoutMs: 0, followRedirects: false });
  });
});
