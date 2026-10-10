import type { Resolution } from "@/lib/bindings";
import { ipc } from "@/lib/ipc";

const cache = new Map<string, Promise<Resolution>>();

/** Resolved value of one variable (nested references and built-ins expanded; secrets come back empty). */
export function previewVariable(
  name: string,
  envId: string | null,
  requestPath: string | null,
  version: number,
): Promise<Resolution> {
  const key = `${version}|${envId ?? ""}|${requestPath ?? ""}|${name}`;
  const hit = cache.get(key);
  if (hit) return hit;

  if (cache.size > 200) cache.clear();
  const pending = ipc
    .resolvePreview([`{{${name}}}`], envId, requestPath)
    .then((list) => list[0] ?? { text: "", unresolved: [name], cyclic: [] })
    .catch((e: unknown) => {
      cache.delete(key); // don't cache failures
      throw e;
    });
  cache.set(key, pending);
  return pending;
}
