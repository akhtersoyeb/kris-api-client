import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResponseSpec } from "@/lib/bindings";
import { IpcError, ipc } from "@/lib/ipc";
import { useResponsesStore } from "@/store/responses";
import { useTabsStore } from "@/store/tabs";

vi.mock("@/lib/ipc", async (importOriginal) => ({
  ...(await importOriginal()),
  ipc: { ping: vi.fn(), sendRequest: vi.fn(), cancelRequest: vi.fn() },
}));

const response: ResponseSpec = {
  status: 200,
  statusText: "OK",
  httpVersion: "HTTP/1.1",
  headers: [],
  body: "{}",
  bodyEncoding: "utf8",
  bodyTruncated: false,
  sizeBytes: 2,
  durationMs: 5,
  finalUrl: "https://x.dev/",
  contentType: "application/json",
};

const store = () => useResponsesStore.getState();
let tabId = "";

beforeEach(() => {
  vi.clearAllMocks();
  useTabsStore.setState({ tabs: [], activeTabId: null });
  useResponsesStore.setState({ runs: {} });
  tabId = useTabsStore.getState().openTab({ url: "https://x.dev" });
});

describe("responses store", () => {
  it("stores a successful response", async () => {
    vi.mocked(ipc.sendRequest).mockResolvedValue(response);
    await store().send(tabId);
    expect(store().runs[tabId]).toEqual({ phase: "done", response });
  });

  it("stores errors from the backend", async () => {
    vi.mocked(ipc.sendRequest).mockRejectedValue(
      new IpcError({ kind: "Network", message: "refused" }),
    );
    await store().send(tabId);
    expect(store().runs[tabId]).toEqual({
      phase: "error",
      error: { kind: "Network", message: "refused" },
    });
  });

  it("goes idle on cancel and ignores the late result", async () => {
    let resolve!: (r: ResponseSpec) => void;
    vi.mocked(ipc.sendRequest).mockReturnValue(new Promise<ResponseSpec>((r) => (resolve = r)));
    vi.mocked(ipc.cancelRequest).mockResolvedValue(true);

    const pending = store().send(tabId);
    expect(store().runs[tabId]?.phase).toBe("sending");

    await store().cancel(tabId);
    expect(store().runs[tabId]).toBeUndefined();

    resolve(response);
    await pending;
    expect(store().runs[tabId]).toBeUndefined();
    expect(ipc.cancelRequest).toHaveBeenCalledOnce();
  });
});
