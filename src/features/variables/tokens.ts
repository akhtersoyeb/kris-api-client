export interface VariableToken {
  start: number;
  end: number;
  name: string;
}

export interface Segment {
  text: string;
  /** null for plain text, the variable name for a {{token}}. */
  name: string | null;
}

// Mirrors the Rust resolver: letters, digits and _ - . $ inside the braces, surrounding spaces allowed.
const TOKEN = /\{\{\s*([\p{L}\p{N}_.$-]+)\s*\}\}/gu;

export function findVariables(text: string): VariableToken[] {
  return [...text.matchAll(TOKEN)].map((m) => ({
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
    name: m[1] ?? "",
  }));
}

export function splitSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;
  for (const token of findVariables(text)) {
    if (token.start > cursor) segments.push({ text: text.slice(cursor, token.start), name: null });
    segments.push({ text: text.slice(token.start, token.end), name: token.name });
    cursor = token.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), name: null });
  return segments;
}

/** Names you can define. A leading $ is reserved for built-ins such as {{$uuid}}. */
export const isValidVariableName = (name: string) => /^[\p{L}\p{N}_.-]+$/u.test(name);
