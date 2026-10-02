import { describe, expect, it, vi } from "vitest";
import { commands } from "@/lib/bindings";
import { IpcError, ipc } from "@/lib/ipc";

vi.mock("@/lib/bindings", () => ({
  commands: { ping: vi.fn() },
}));

describe("ipc.ping", () => {
  it("returns data on success", async () => {
    vi.mocked(commands.ping).mockResolvedValue({
      status: "ok",
      data: { reply: "pong: hi", appVersion: "0.0.0" },
    });
    await expect(ipc.ping("hi")).resolves.toEqual({ reply: "pong: hi", appVersion: "0.0.0" });
  });

  it("throws IpcError on failure", async () => {
    vi.mocked(commands.ping).mockResolvedValue({
      status: "error",
      error: { kind: "InvalidInput", message: "message must not be empty" },
    });
    const err = await ipc.ping("").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(IpcError);
    expect((err as IpcError).kind).toBe("InvalidInput");
  });
});
