/** Re-indents JSON text without parsing it, so large numbers (e.g. 64-bit ids) stay exact. */
export function formatJsonText(text: string, indent = "  "): string {
  let out = "";
  let depth = 0;
  let inString = false;
  let escaped = false;
  const newline = () => `\n${indent.repeat(depth)}`;
  const nextSignificant = (from: number) => {
    let i = from;
    while (i < text.length && " \n\r\t".includes(text.charAt(i))) i++;
    return text.charAt(i);
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    switch (ch) {
      case '"':
        inString = true;
        out += ch;
        break;
      case "{":
      case "[":
        if (nextSignificant(i + 1) === (ch === "{" ? "}" : "]")) {
          out += ch; // keep empty containers on one line
        } else {
          depth++;
          out += ch + newline();
        }
        break;
      case "}":
      case "]":
        if (out.endsWith(ch === "}" ? "{" : "[")) {
          out += ch;
        } else {
          depth--;
          out += newline() + ch;
        }
        break;
      case ",":
        out += "," + newline();
        break;
      case ":":
        out += ": ";
        break;
      case " ":
      case "\n":
      case "\r":
      case "\t":
        break;
      default:
        out += ch;
    }
  }
  return out;
}

export type ViewLanguage = "json" | "xml" | "html" | "plaintext";

/** Above this size we skip Monaco and pretty-printing. */
export const VIEW_LIMIT = 5 * 1024 * 1024;

export function detectLanguage(contentType: string | null, body: string): ViewLanguage {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("json")) return "json";
  if (ct.includes("html")) return "html";
  if (ct.includes("xml")) return "xml";
  const head = body.trimStart().charAt(0);
  if ((head === "{" || head === "[") && body.length <= VIEW_LIMIT) {
    try {
      JSON.parse(body);
      return "json";
    } catch {
      /* not json */
    }
  }
  return "plaintext";
}
