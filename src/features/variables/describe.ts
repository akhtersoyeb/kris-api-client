import type { Resolution, VariableInfo, VariableScope } from "@/lib/bindings";

export type SummaryKind = "defined" | "secret" | "builtin" | "undefined" | "cyclic";

export interface VariableSummary {
  kind: SummaryKind;
  scope: string | null;
  value: string | null;
  /** Variables used inside this one's value that aren't defined. */
  unresolved: string[];
}

const SCOPE_LABEL: Record<VariableScope, string> = {
  builtin: "Built-in",
  global: "Global",
  collection: "Collection",
  environment: "Environment",
};

/** Turns the context entry plus an optional resolved preview into something displayable. */
export function summarize(
  info: VariableInfo | undefined,
  resolution: Resolution | null,
): VariableSummary {
  if (!info) return { kind: "undefined", scope: null, value: null, unresolved: [] };
  const scope = SCOPE_LABEL[info.scope];
  const unresolved = resolution?.unresolved ?? [];
  if (info.secret) return { kind: "secret", scope, value: null, unresolved: [] };
  if (resolution && resolution.cyclic.length > 0)
    return { kind: "cyclic", scope, value: null, unresolved };
  if (info.scope === "builtin")
    return { kind: "builtin", scope, value: resolution?.text ?? null, unresolved };
  return { kind: "defined", scope, value: resolution ? resolution.text : info.value, unresolved };
}
