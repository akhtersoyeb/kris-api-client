import { useCallback, useEffect, useState } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/features/workspace/actions";
import type { ScopeRef } from "@/lib/bindings";
import { ipc } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import { useDialogs } from "@/store/dialogs";
import { useVariablesStore, type ManagerSelection } from "@/store/variables";
import { useWorkspaceStore } from "@/store/workspace";
import {
  createEnvironmentFlow,
  deleteEnvironmentFlow,
  duplicateEnvironmentFlow,
  loadEnvironments,
} from "./actions";
import { toRows, toVariables, type VariableRow } from "./variable-rows";
import { VariablesEditor } from "./VariablesEditor";

interface Draft {
  name: string;
  rows: VariableRow[];
  secretsError: string | null;
  baseline: string;
}

const fingerprint = (name: string, rows: VariableRow[]) =>
  JSON.stringify([name, toVariables(rows)]);
const toScope = (s: Exclude<ManagerSelection, { kind: "environment" }>): ScopeRef =>
  s.kind === "global" ? { type: "global" } : { type: "collection", path: s.path };
const sameSelection = (a: ManagerSelection | null, b: ManagerSelection | null) =>
  JSON.stringify(a) === JSON.stringify(b);

async function loadDraft(
  selection: ManagerSelection,
  collectionName: string | undefined,
): Promise<Draft> {
  if (selection.kind === "environment") {
    const env = await ipc.loadEnvironment(selection.id);
    const rows = toRows(env.variables);
    return {
      name: env.name,
      rows,
      secretsError: env.secretsError ?? null,
      baseline: fingerprint(env.name, rows),
    };
  }
  const result = await ipc.getScopeVariables(toScope(selection));
  const rows = toRows(result.variables);
  const name =
    selection.kind === "global" ? "Global variables" : (collectionName ?? selection.path);
  return { name, rows, secretsError: result.secretsError, baseline: fingerprint(name, rows) };
}

function NavItem({
  label,
  active,
  badge,
  onClick,
}: {
  label: string;
  active: boolean;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-accent",
        active && "bg-accent font-medium",
      )}
    >
      <span className="truncate">{label}</span>
      {badge && (
        <span className="ml-2 shrink-0 rounded bg-primary/15 px-1.5 text-[10px] text-primary uppercase">
          {badge}
        </span>
      )}
    </button>
  );
}

const SectionTitle = ({ children }: { children: string }) => (
  <h3 className="px-2 pt-3 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
    {children}
  </h3>
);

export function VariablesDialog() {
  const { open, selection } = useVariablesStore((s) => s.manager);
  const environments = useVariablesStore((s) => s.environments);
  const activeEnvId = useVariablesStore((s) => s.activeEnvId);
  const nodes = useWorkspaceStore((s) => s.nodes);
  const collections = nodes.filter((n) => n.kind === "collection");

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const selectionKey = JSON.stringify(selection);
  const dirty = !!draft && fingerprint(draft.name, draft.rows) !== draft.baseline;

  const reload = useCallback(async () => {
    if (!selection) return;
    const collectionName =
      selection.kind === "collection"
        ? collections.find((c) => c.path === selection.path)?.name
        : undefined;
    try {
      setDraft(await loadDraft(selection, collectionName));
    } catch (e) {
      toast.error("Could not load variables", { description: errorMessage(e) });
      setDraft(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the selection, not on every tree change
  }, [selectionKey]);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(null);
    void reload();
  }, [open, reload]);

  async function confirmDiscard() {
    return useDialogs.getState().askConfirm({
      title: "Discard unsaved changes?",
      description: "You have edits that haven't been saved.",
      confirmLabel: "Discard",
      destructive: true,
    });
  }

  async function choose(next: ManagerSelection | null) {
    if (!next || sameSelection(next, selection)) return;
    if (dirty && !(await confirmDiscard())) return;
    useVariablesStore.getState().selectInManager(next);
  }

  async function requestClose() {
    if (dirty && !(await confirmDiscard())) return;
    useVariablesStore.getState().closeManager();
  }

  async function save() {
    if (!selection || !draft) return;
    setSaving(true);
    try {
      let rows: VariableRow[];
      let secretsError: string | null;
      let name = draft.name;
      if (selection.kind === "environment") {
        const env = await ipc.saveEnvironment({
          id: selection.id,
          name: draft.name,
          variables: toVariables(draft.rows),
          secretsError: null,
        });
        rows = toRows(env.variables);
        secretsError = env.secretsError ?? null;
        name = env.name;
        await loadEnvironments();
      } else {
        const result = await ipc.setScopeVariables(toScope(selection), toVariables(draft.rows));
        rows = toRows(result.variables);
        secretsError = result.secretsError;
      }
      setDraft({ name, rows, secretsError, baseline: fingerprint(name, rows) });
      useVariablesStore.getState().bump(); // refresh highlighting and previews everywhere
      toast.success("Variables saved");
    } catch (e) {
      toast.error("Could not save variables", { description: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  }

  async function addEnvironment() {
    if (dirty && !(await confirmDiscard())) return;
    const id = await createEnvironmentFlow();
    if (id) useVariablesStore.getState().selectInManager({ kind: "environment", id });
  }

  const selectedEnv =
    selection?.kind === "environment" ? environments.find((e) => e.id === selection.id) : undefined;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && void requestClose()}>
      <DialogContent className="flex h-[80vh] max-h-180 w-[92vw] flex-col gap-0 p-0 sm:max-w-4xl">
        <DialogTitle className="sr-only">Variables</DialogTitle>
        <DialogDescription className="sr-only">
          Manage environments, global and collection variables.
        </DialogDescription>
        <div className="flex min-h-0 flex-1">
          <nav className="w-60 shrink-0 overflow-y-auto border-r p-2">
            <SectionTitle>Global</SectionTitle>
            <NavItem
              label="Global variables"
              active={selection?.kind === "global"}
              onClick={() => void choose({ kind: "global" })}
            />
            <SectionTitle>Collections</SectionTitle>
            {collections.length === 0 && (
              <p className="px-2 text-xs text-muted-foreground">No collections yet.</p>
            )}
            {collections.map((c) => (
              <NavItem
                key={c.path}
                label={c.name}
                active={selection?.kind === "collection" && selection.path === c.path}
                onClick={() => void choose({ kind: "collection", path: c.path })}
              />
            ))}
            <div className="flex items-center justify-between pr-1">
              <SectionTitle>Environments</SectionTitle>
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                aria-label="New environment"
                onClick={() => void addEnvironment()}
              >
                <Plus className="size-4" />
              </Button>
            </div>
            {environments.length === 0 && (
              <p className="px-2 text-xs text-muted-foreground">No environments yet.</p>
            )}
            {environments.map((e) => (
              <NavItem
                key={e.id}
                label={e.name}
                badge={e.id === activeEnvId ? "Active" : undefined}
                active={selection?.kind === "environment" && selection.id === e.id}
                onClick={() => void choose({ kind: "environment", id: e.id })}
              />
            ))}
          </nav>

          <section className="flex min-w-0 flex-1 flex-col">
            {!draft || !selection ? (
              <p className="p-6 text-sm text-muted-foreground">Loading...</p>
            ) : (
              <>
                <header className="flex items-center gap-2 border-b p-3">
                  {selection.kind === "environment" ? (
                    <Input
                      aria-label="Environment name"
                      className="h-8 max-w-xs font-medium"
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    />
                  ) : (
                    <div>
                      <h2 className="text-sm font-semibold">{draft.name}</h2>
                      <p className="text-xs text-muted-foreground">
                        {selection.kind === "global"
                          ? "Available to every request in this workspace."
                          : "Available to requests in this collection."}
                      </p>
                    </div>
                  )}
                  <div className="flex-1" />
                  {selectedEnv && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        disabled={dirty}
                        onClick={() => useVariablesStore.getState().setActive(selectedEnv.id)}
                      >
                        {selectedEnv.id === activeEnvId ? "Active" : "Use this environment"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label="Duplicate environment"
                        disabled={dirty}
                        onClick={() =>
                          void duplicateEnvironmentFlow(selectedEnv.id).then(
                            (id) =>
                              id &&
                              useVariablesStore
                                .getState()
                                .selectInManager({ kind: "environment", id }),
                          )
                        }
                      >
                        <Copy className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label="Delete environment"
                        onClick={() =>
                          void deleteEnvironmentFlow(selectedEnv).then(
                            (gone) =>
                              gone &&
                              useVariablesStore.getState().selectInManager({ kind: "global" }),
                          )
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  )}
                </header>

                {draft.secretsError && (
                  <div className="border-b bg-amber-500/10 px-3 py-2 text-xs">
                    The system keychain couldn't be read ({draft.secretsError}). Secret values show
                    as empty; saving leaves the stored secrets untouched unless you type a new
                    value.
                  </div>
                )}

                <div className="min-h-0 flex-1 overflow-y-auto">
                  <VariablesEditor
                    rows={draft.rows}
                    onChange={(rows) => setDraft({ ...draft, rows })}
                  />
                </div>

                <footer className="flex items-center gap-2 border-t p-3">
                  <p className="flex-1 text-xs text-muted-foreground">
                    Precedence: environment, then collection, then global. Values that aren't secret
                    are saved in plain text in your workspace files and can end up in Git.
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!dirty || saving}
                    onClick={() => void reload()}
                  >
                    Revert
                  </Button>
                  <Button size="sm" disabled={!dirty || saving} onClick={() => void save()}>
                    Save
                  </Button>
                </footer>
              </>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
