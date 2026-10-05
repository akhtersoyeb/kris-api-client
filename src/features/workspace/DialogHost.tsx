import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { containerOptions } from "@/features/collections/tree";
import { useDialogs, type DialogRequest } from "@/store/dialogs";
import { useWorkspaceStore } from "@/store/workspace";

type Req<K extends DialogRequest["kind"]> = Extract<DialogRequest, { kind: K }>;

function finish<T>(resolve: (v: T) => void, value: T) {
  useDialogs.getState().close();
  resolve(value);
}

function NameDialog({ req }: { req: Req<"name"> }) {
  const [value, setValue] = useState(req.initial);
  return (
    <Dialog open onOpenChange={(o) => !o && finish(req.resolve, null)}>
      <DialogContent className="sm:max-w-md">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim()) finish(req.resolve, value.trim());
          }}
        >
          <DialogHeader>
            <DialogTitle>{req.title}</DialogTitle>
          </DialogHeader>
          <label className="block space-y-1 text-sm">
            <span>{req.label}</span>
            <Input
              autoFocus
              value={value}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => finish(req.resolve, null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!value.trim()}>
              {req.confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmDialog({ req }: { req: Req<"confirm"> }) {
  return (
    <Dialog open onOpenChange={(o) => !o && finish(req.resolve, false)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{req.title}</DialogTitle>
          <DialogDescription>{req.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => finish(req.resolve, false)}>
            Cancel
          </Button>
          <Button
            variant={req.destructive ? "destructive" : "default"}
            onClick={() => finish(req.resolve, true)}
          >
            {req.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UnsavedDialog({ req }: { req: Req<"unsaved"> }) {
  return (
    <Dialog open onOpenChange={(o) => !o && finish(req.resolve, "cancel")}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save changes to "{req.name}"?</DialogTitle>
          <DialogDescription>Your changes will be lost if you don't save them.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => finish(req.resolve, "cancel")}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => finish(req.resolve, "discard")}>
            Don't save
          </Button>
          <Button onClick={() => finish(req.resolve, "save")}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LocationDialog({ req }: { req: Req<"location"> }) {
  const nodes = useWorkspaceStore((s) => s.nodes);
  const options = containerOptions(nodes);
  const [parentPath, setParentPath] = useState(options[0]?.path ?? "");
  const [name, setName] = useState(req.initialName);
  return (
    <Dialog open onOpenChange={(o) => !o && finish(req.resolve, null)}>
      <DialogContent className="sm:max-w-md">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) finish(req.resolve, { parentPath, name: name.trim() });
          }}
        >
          <DialogHeader>
            <DialogTitle>Save request</DialogTitle>
          </DialogHeader>
          <label className="block space-y-1 text-sm">
            <span>Name</span>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          {options.length > 0 ? (
            <label className="block space-y-1 text-sm">
              <span>Save in</span>
              <select
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={parentPath}
                onChange={(e) => setParentPath(e.target.value)}
              >
                {options.map((o) => (
                  <option key={o.path} value={o.path}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="text-sm text-muted-foreground">
              No collections yet. A collection named "My Requests" will be created.
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => finish(req.resolve, null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DialogHost() {
  const current = useDialogs((s) => s.current);
  const version = useDialogs((s) => s.version);
  if (!current) return null;
  switch (current.kind) {
    case "name":
      return <NameDialog key={version} req={current} />;
    case "confirm":
      return <ConfirmDialog key={version} req={current} />;
    case "unsaved":
      return <UnsavedDialog key={version} req={current} />;
    case "location":
      return <LocationDialog key={version} req={current} />;
  }
}
