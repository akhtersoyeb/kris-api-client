import { beforeEach, describe, expect, it } from "vitest";
import { useTabsStore } from "@/store/tabs";
import type { RequestFile } from "@/lib/bindings";

const store = () => useTabsStore.getState();
const ids = () => store().tabs.map((t) => t.id);

beforeEach(() => {
  useTabsStore.setState({ tabs: [], activeTabId: null });
});

describe("tabs store", () => {
  it("opens a tab and makes it active", () => {
    const id = store().openTab({ url: "https://example.com" });
    expect(store().tabs).toHaveLength(1);
    expect(store().activeTabId).toBe(id);
    expect(store().tabs[0]?.method).toBe("GET");
  });

  it("activates the right neighbour when the active tab closes", () => {
    const a = store().openTab();
    const b = store().openTab();
    const c = store().openTab();
    store().setActiveTab(b);
    store().closeTab(b);
    expect(store().activeTabId).toBe(c);
    store().closeTab(c);
    expect(store().activeTabId).toBe(a);
  });

  it("clears the active tab when the last tab closes", () => {
    const a = store().openTab();
    store().closeTab(a);
    expect(store().tabs).toEqual([]);
    expect(store().activeTabId).toBeNull();
  });

  it("keeps the active tab when a background tab closes", () => {
    const a = store().openTab();
    const b = store().openTab();
    store().closeTab(a);
    expect(store().activeTabId).toBe(b);
  });

  it("ignores unknown ids", () => {
    const a = store().openTab();
    store().setActiveTab("nope");
    store().closeTab("nope");
    expect(store().activeTabId).toBe(a);
    expect(store().tabs).toHaveLength(1);
  });

  it("reorders tabs", () => {
    const [a, b, c] = [store().openTab(), store().openTab(), store().openTab()];
    store().moveTab(0, 2);
    expect(ids()).toEqual([b, c, a]);
    store().moveTab(5, 0); // out of range, no-op
    expect(ids()).toEqual([b, c, a]);
  });

  it("closes other tabs", () => {
    store().openTab();
    const b = store().openTab();
    store().openTab();
    store().closeOtherTabs(b);
    expect(ids()).toEqual([b]);
    expect(store().activeTabId).toBe(b);
  });

  it("marks a tab dirty on update unless told otherwise", () => {
    const a = store().openTab();
    store().updateTab(a, { url: "https://x.dev" });
    expect(store().tabs[0]).toMatchObject({ url: "https://x.dev", dirty: true });
    store().updateTab(a, { dirty: false });
    expect(store().tabs[0]?.dirty).toBe(false);
  });

  it("opens tabs with empty request details", () => {
    store().openTab();
    expect(store().tabs[0]).toMatchObject({ params: [], headers: [], body: { mode: "none" } });
    expect(store().tabs[0]?.settings).toEqual({ timeoutMs: 30000, followRedirects: true });
  });
});

const file: RequestFile = {
  schemaVersion: 1,
  id: "01X",
  name: "Login",
  method: "POST",
  url: "https://x.dev/login",
  params: [],
  headers: [],
  body: { mode: "json", json: '{"a":1}', raw: "", rawMime: "text/plain", form: [] },
  settings: { timeoutMs: 30000, followRedirects: true },
};

describe("saved requests", () => {
  it("opens clean, becomes dirty on edit and clean again when reverted", () => {
    const id = store().openSavedRequest("collections/api/login.request.json", file);
    expect(store().tabs[0]?.dirty).toBe(false);
    store().updateTab(id, { url: "https://x.dev/other" });
    expect(store().tabs[0]?.dirty).toBe(true);
    store().updateTab(id, { url: "https://x.dev/login" });
    expect(store().tabs[0]?.dirty).toBe(false);
  });

  it("follows renames and moves", () => {
    store().openSavedRequest("collections/api/login.request.json", file);
    store().retarget("collections/api", "collections/v2", undefined);
    expect(store().tabs[0]?.path).toBe("collections/v2/login.request.json");
    store().retarget(
      "collections/v2/login.request.json",
      "collections/v2/sign-in.request.json",
      "Sign in",
    );
    expect(store().tabs[0]).toMatchObject({ title: "Sign in", dirty: false });
  });

  it("keeps content as a draft when its file is removed", () => {
    store().openSavedRequest("collections/api/login.request.json", file);
    expect(store().detachUnder("collections/api")).toBe(1);
    expect(store().tabs[0]).toMatchObject({ path: null, saved: null, dirty: true });
  });
});
