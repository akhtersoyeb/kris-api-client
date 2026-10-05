import type { KeyValue, RequestFile } from "@/lib/bindings";
import {
  HTTP_METHODS,
  defaultBody,
  defaultSettings,
  newRow,
  type HttpMethod,
  type KeyValueRow,
} from "@/store/request-draft";
import type { RequestTab } from "@/store/tabs";

/** The part of a tab that is persisted to disk. */
export type SavedFields = Pick<
  RequestTab,
  "title" | "method" | "url" | "params" | "headers" | "body" | "settings"
>;

const toKeyValues = (rows: KeyValueRow[]): KeyValue[] =>
  rows.map(({ key, value, enabled }) => ({ key, value, enabled }));
const toRows = (items: KeyValue[]): KeyValueRow[] => items.map((item) => newRow(item));

/** The backend assigns the real id and schema version, so those are placeholders here. */
export function tabToRequestFile(tab: SavedFields, name: string = tab.title): RequestFile {
  return {
    schemaVersion: 1,
    id: "",
    name,
    method: tab.method,
    url: tab.url,
    params: toKeyValues(tab.params),
    headers: toKeyValues(tab.headers),
    body: {
      mode: tab.body.mode,
      json: tab.body.json,
      raw: tab.body.raw,
      rawMime: tab.body.rawMime,
      form: toKeyValues(tab.body.form),
    },
    settings: { timeoutMs: tab.settings.timeoutMs, followRedirects: tab.settings.followRedirects },
  };
}

export function requestFileToFields(file: RequestFile): SavedFields {
  const known = (HTTP_METHODS as readonly string[]).includes(file.method);
  return {
    title: file.name,
    method: known ? (file.method as HttpMethod) : "GET",
    url: file.url,
    // Not re-synced with the URL on purpose: the round trip must be exact, or saves look like edits.
    params: toRows(file.params ?? []),
    headers: toRows(file.headers ?? []),
    body: {
      mode: file.body.mode,
      json: file.body.json ?? "",
      raw: file.body.raw ?? "",
      rawMime: file.body.rawMime ?? "text/plain",
      form: toRows(file.body.form ?? []),
    },
    settings: {
      timeoutMs: file.settings.timeoutMs,
      followRedirects: file.settings.followRedirects,
    },
  };
}

export const snapshot = (fields: SavedFields): string => JSON.stringify(tabToRequestFile(fields));
export const snapshotOfFile = (file: RequestFile): string => snapshot(requestFileToFields(file));

export function blankRequestFile(name: string): RequestFile {
  return tabToRequestFile({
    title: name,
    method: "GET",
    url: "",
    params: [],
    headers: [],
    body: defaultBody(),
    settings: defaultSettings(),
  });
}

/** After a rename, keep the saved snapshot's name in step so the tab doesn't look edited. */
export function withSnapshotName(saved: string | null, name: string): string | null {
  if (saved === null) return null;
  try {
    return JSON.stringify({ ...(JSON.parse(saved) as object), name });
  } catch {
    return saved;
  }
}

const isBlank = (t: RequestTab) =>
  t.method === "GET" &&
  t.url === "" &&
  t.params.length === 0 &&
  t.headers.length === 0 &&
  t.body.mode === "none" &&
  t.body.json === "" &&
  t.body.raw === "" &&
  t.body.form.length === 0;

/** Unsaved tabs are dirty once they hold anything; saved tabs when they differ from the snapshot. */
export function isDirty(tab: RequestTab): boolean {
  return tab.saved === null ? !isBlank(tab) : snapshot(tab) !== tab.saved;
}
