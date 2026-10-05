import { describe, expect, it } from "vitest";
import { defaultBody, defaultSettings, newRow } from "@/store/request-draft";
import type { RequestTab } from "@/store/tabs";
import { isDirty, requestFileToFields, snapshot, tabToRequestFile } from "./request-doc";

const makeTab = (patch: Partial<RequestTab> = {}): RequestTab => ({
  id: "t1",
  title: "Login",
  method: "POST",
  url: "https://x.dev/login?a=1",
  dirty: false,
  params: [newRow({ key: "a", value: "1" }), newRow({ key: "off", value: "x", enabled: false })],
  headers: [newRow({ key: "Accept", value: "*/*" })],
  body: { ...defaultBody(), mode: "json", json: '{"a":1}' },
  settings: defaultSettings(),
  path: null,
  saved: null,
  conflict: false,
  ...patch,
});

describe("request documents", () => {
  it("round-trips through the file format without changing the snapshot", () => {
    const tab = makeTab();
    expect(snapshot(requestFileToFields(tabToRequestFile(tab)))).toBe(snapshot(tab));
  });

  it("ignores row ids when comparing", () => {
    const a = makeTab();
    const b = makeTab({ headers: [newRow({ key: "Accept", value: "*/*" })] });
    expect(snapshot(a)).toBe(snapshot(b));
  });

  it("is dirty only when content differs from the saved snapshot", () => {
    const saved = makeTab();
    saved.saved = snapshot(saved);
    expect(isDirty(saved)).toBe(false);
    expect(isDirty({ ...saved, url: "https://other.dev" })).toBe(true);
  });

  it("treats a blank unsaved tab as clean and a typed one as dirty", () => {
    const blank = makeTab({ method: "GET", url: "", params: [], headers: [], body: defaultBody() });
    expect(isDirty(blank)).toBe(false);
    expect(isDirty({ ...blank, url: "x" })).toBe(true);
  });

  it("falls back to GET for unknown methods", () => {
    const file = { ...tabToRequestFile(makeTab()), method: "BREW" };
    expect(requestFileToFields(file).method).toBe("GET");
  });
});
