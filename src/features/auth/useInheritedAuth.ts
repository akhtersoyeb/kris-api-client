import { useEffect, useState } from "react";
import type { AuthConfig } from "@/lib/bindings";
import { ipc } from "@/lib/ipc";
import { collectionOf } from "@/lib/paths";
import { useUiStore } from "@/store/ui";

export type Inherited =
  | { kind: "unsaved" }
  | { kind: "loading" }
  | { kind: "ready"; collection: string; auth: AuthConfig | null };

/** What "inherit" resolves to for a request, fetched from its collection. */
export function useInheritedAuth(requestPath: string | null): Inherited {
  const version = useUiStore((s) => s.authVersion);
  const collection = requestPath ? collectionOf(requestPath) : null;
  const key = collection ? `${collection}|${version}` : null;
  const [loaded, setLoaded] = useState<{ key: string; auth: AuthConfig | null } | null>(null);

  useEffect(() => {
    if (!collection || key === null) return;
    let live = true;
    ipc
      .getCollectionAuth(collection)
      .then((auth) => live && setLoaded({ key, auth }))
      .catch(() => live && setLoaded({ key, auth: null }));
    return () => {
      live = false;
    };
  }, [collection, key]);

  if (!collection) return { kind: "unsaved" };
  return loaded?.key === key
    ? { kind: "ready", collection, auth: loaded.auth }
    : { kind: "loading" };
}
