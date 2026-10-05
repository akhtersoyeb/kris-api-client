export interface KeyValueRow {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export const newRow = (init: Partial<Omit<KeyValueRow, "id">> = {}): KeyValueRow => ({
  id: crypto.randomUUID(),
  key: "",
  value: "",
  enabled: true,
  ...init,
});

export type BodyMode = "none" | "json" | "raw" | "form";

export interface BodyDraft {
  mode: BodyMode;
  json: string;
  raw: string;
  rawMime: string;
  form: KeyValueRow[];
}

export interface SettingsDraft {
  timeoutMs: number;
  followRedirects: boolean;
}

export const defaultBody = (): BodyDraft => ({
  mode: "none",
  json: "",
  raw: "",
  rawMime: "text/plain",
  form: [],
});

export const defaultSettings = (): SettingsDraft => ({ timeoutMs: 30_000, followRedirects: true });

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];
