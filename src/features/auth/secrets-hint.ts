const SAFE = new Set(["", "bearer", "basic", "token", "digest"]);

/** True when a value holds a literal secret (not just {{variables}}) that would be written to a workspace file. */
export function isLiteralSecret(value: string): boolean {
  const withoutVariables = value.replace(/\{\{[^}]*\}\}/g, "");
  return !SAFE.has(withoutVariables.trim().toLowerCase());
}
