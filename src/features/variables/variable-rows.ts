import type { Variable } from "@/lib/bindings";

export interface VariableRow {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  secret: boolean;
}

export const newVariableRow = (init: Partial<VariableRow> = {}): VariableRow => ({
  id: crypto.randomUUID(),
  key: "",
  value: "",
  enabled: true,
  secret: false,
  ...init,
});

export const toRows = (variables: Variable[]): VariableRow[] =>
  variables.map((v) =>
    newVariableRow({ key: v.key, value: v.value, enabled: v.enabled, secret: v.secret }),
  );

export const toVariables = (rows: VariableRow[]): Variable[] =>
  rows
    .filter((r) => r.key.trim() !== "")
    .map(({ key, value, enabled, secret }) => ({ key: key.trim(), value, enabled, secret }));
