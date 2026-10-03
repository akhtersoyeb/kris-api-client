import { newRow, type KeyValueRow } from "@/store/request-draft";

// Keep {{variables}} readable in the URL (they get resolved before sending in Phase 4).
const encode = (s: string) => encodeURIComponent(s).replace(/%7B/gi, "{").replace(/%7D/gi, "}");

function decode(s: string): string {
  const spaced = s.replace(/\+/g, " ");
  try {
    return decodeURIComponent(spaced);
  } catch {
    return spaced; // malformed %-escape while the user is mid-typing
  }
}

function split(url: string) {
  const hashAt = url.indexOf("#");
  const hash = hashAt === -1 ? "" : url.slice(hashAt);
  const beforeHash = hashAt === -1 ? url : url.slice(0, hashAt);
  const q = beforeHash.indexOf("?");
  return q === -1
    ? { base: beforeHash, query: null, hash }
    : { base: beforeHash.slice(0, q), query: beforeHash.slice(q + 1), hash };
}

export function parseQuery(url: string): Array<{ key: string; value: string }> {
  const { query } = split(url);
  if (!query) return [];
  return query
    .split("&")
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf("=");
      return eq === -1
        ? { key: decode(pair), value: "" }
        : { key: decode(pair.slice(0, eq)), value: decode(pair.slice(eq + 1)) };
    });
}

/** Rewrites the URL's query from the enabled rows. Keeps the base and #hash. */
export function applyParams(url: string, rows: KeyValueRow[]): string {
  const { base, hash } = split(url);
  const query = rows
    .filter((r) => r.enabled && r.key !== "")
    .map((r) => `${encode(r.key)}=${encode(r.value)}`)
    .join("&");
  return `${base}${query ? `?${query}` : ""}${hash}`;
}

/** Rebuilds the table after the URL was edited. Disabled rows survive (they aren't in the URL). */
export function syncParamsFromUrl(url: string, existing: KeyValueRow[]): KeyValueRow[] {
  const enabled = existing.filter((r) => r.enabled);
  const disabled = existing.filter((r) => !r.enabled);
  const fromUrl = parseQuery(url).map((p, i) => ({
    id: enabled[i]?.id ?? newRow().id, // reuse ids so inputs keep focus
    key: p.key,
    value: p.value,
    enabled: true,
  }));
  return [...fromUrl, ...disabled];
}
