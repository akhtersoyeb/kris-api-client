import { commands, type AppError, type RequestFile, type RequestSpec } from "@/lib/bindings";

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
  sendRequest: (requestId: string, spec: RequestSpec) =>
    unwrap(commands.sendRequest(requestId, spec)),
  cancelRequest: (requestId: string) => commands.cancelRequest(requestId),

  openWorkspace: (path: string) => unwrap(commands.openWorkspace(path)),
  createWorkspace: (parentDir: string, name: string) =>
    unwrap(commands.createWorkspace(parentDir, name)),
  closeWorkspace: () => commands.closeWorkspace(),
  refreshWorkspace: () => unwrap(commands.refreshWorkspace()),
  listRecentWorkspaces: () => unwrap(commands.listRecentWorkspaces()),
  forgetRecentWorkspace: (path: string) => unwrap(commands.forgetRecentWorkspace(path)),

  createCollection: (name: string) => unwrap(commands.createCollection(name)),
  createFolder: (parentPath: string, name: string) =>
    unwrap(commands.createFolder(parentPath, name)),
  createRequest: (parentPath: string, request: RequestFile) =>
    unwrap(commands.createRequest(parentPath, request)),
  renameNode: (path: string, newName: string) => unwrap(commands.renameNode(path, newName)),
  duplicateNode: (path: string) => unwrap(commands.duplicateNode(path)),
  deleteNode: (path: string) => unwrap(commands.deleteNode(path)),
  moveNode: (path: string, newParentPath: string, order: string[]) =>
    unwrap(commands.moveNode(path, newParentPath, order)),

  loadRequest: (path: string) => unwrap(commands.loadRequest(path)),
  saveRequest: (path: string, request: RequestFile) => unwrap(commands.saveRequest(path, request)),

  saveSession: (workspaceId: string, json: string) =>
    unwrap(commands.saveSession(workspaceId, json)),
  loadSession: (workspaceId: string) => unwrap(commands.loadSession(workspaceId)),
};
