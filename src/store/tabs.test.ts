import { beforeEach, describe, expect, it } from "vitest";
import { useTabsStore } from "@/store/tabs";

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
});
