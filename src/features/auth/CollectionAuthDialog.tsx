import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AuthConfig } from "@/lib/bindings";
import { ipc } from "@/lib/ipc";
import { useUiStore } from "@/store/ui";
import { useWorkspaceStore } from "@/store/workspace";
import { AuthEditor } from "./AuthEditor";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function Editor({
  path,
  initial,
  close,
}: {
  path: string;
  initial: AuthConfig;
  close: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await ipc.setCollectionAuth(path, draft);
      useUiStore.getState().bumpAuth(); // request tabs refresh their "inherited" summary
      toast.success("Collection auth saved");
      close();
    } catch (e) {
      toast.error("Could not save", { description: message(e) });
      setSaving(false);
    }
  }

  return (
    <>
      <AuthEditor allowInherit={false} value={draft} onChange={setDraft} />
      <DialogFooter>
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button disabled={saving} onClick={() => void save()}>
          Save
        </Button>
      </DialogFooter>
    </>
  );
}

function Body({ path, close }: { path: string; close: () => void }) {
  const [initial, setInitial] = useState<AuthConfig | null>(null);

  useEffect(() => {
    let live = true;
    ipc
      .getCollectionAuth(path)
      .then((auth) => live && setInitial(auth))
      .catch((e: unknown) => {
        toast.error("Could not load the collection's auth", { description: message(e) });
        close();
      });
    return () => {
      live = false;
    };
  }, [path, close]);

  return initial ? (
    <Editor path={path} initial={initial} close={close} />
  ) : (
    <p className="p-4 text-sm text-muted-foreground">Loading...</p>
  );
}

export function CollectionAuthDialog() {
  const path = useUiStore((s) => s.collectionAuthPath);
  const close = useUiStore((s) => s.closeCollectionAuth);
  const name = useWorkspaceStore((s) => s.nodes.find((n) => n.path === path)?.name ?? "collection");

  return (
    <Dialog open={path !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Auth for "{name}"</DialogTitle>
          <DialogDescription>
            Requests in this collection set to "Inherit from collection" use this.
          </DialogDescription>
        </DialogHeader>
        {path && <Body key={path} path={path} close={close} />}
      </DialogContent>
    </Dialog>
  );
}
