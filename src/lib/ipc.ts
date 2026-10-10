import {
  commands,
  type AppError,
  type RequestFile,
  type RequestSpec,
  type Environment,
  type ScopeRef,
  type Variable,
} from "@/lib/bindings";

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
  sendRequest: (
    requestId: string,
    spec: RequestSpec,
    environmentId: string | null,
    requestPath: string | null,
  ) => unwrap(commands.sendRequest(requestId, spec, environmentId, requestPath)),
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
  listEnvironments: () => unwrap(commands.listEnvironments()),
  createEnvironment: (name: string) => unwrap(commands.createEnvironment(name)),
  loadEnvironment: (id: string) => unwrap(commands.loadEnvironment(id)),
  saveEnvironment: (environment: Environment) => unwrap(commands.saveEnvironment(environment)),
  duplicateEnvironment: (id: string) => unwrap(commands.duplicateEnvironment(id)),
  deleteEnvironment: (id: string) => unwrap(commands.deleteEnvironment(id)),
  getScopeVariables: (scope: ScopeRef) => unwrap(commands.getScopeVariables(scope)),
  setScopeVariables: (scope: ScopeRef, variables: Variable[]) =>
    unwrap(commands.setScopeVariables(scope, variables)),
  variableContext: (environmentId: string | null, requestPath: string | null) =>
    unwrap(commands.variableContext(environmentId, requestPath)),
  resolvePreview: (texts: string[], environmentId: string | null, requestPath: string | null) =>
    unwrap(commands.resolvePreview(texts, environmentId, requestPath)),
};
