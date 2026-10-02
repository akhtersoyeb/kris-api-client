import { commands, type AppError } from "@/lib/bindings";

type Result<T, E> = { status: "ok"; data: T } | { status: "error"; error: E };

export class IpcError extends Error {
  readonly payload: AppError;

  constructor(payload: AppError) {
    super(payload.message);
    this.name = "IpcError";
    this.payload = payload;
  }

  get kind(): AppError["kind"] {
    return this.payload.kind;
  }
}

export async function unwrap<T>(call: Promise<Result<T, AppError>>): Promise<T> {
  const result = await call;
  if (result.status === "ok") return result.data;
  throw new IpcError(result.error);
}

/** Single entry point for all backend calls. Add one line per new command. */
export const ipc = {
  ping: (message: string) => unwrap(commands.ping(message)),
};
