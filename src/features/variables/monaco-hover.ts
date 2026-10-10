import * as monaco from "monaco-editor";
import { useTabsStore } from "@/store/tabs";
import { useVariablesStore } from "@/store/variables";
import { summarize, type VariableSummary } from "./describe";
import { previewVariable } from "./preview";
import { findVariables } from "./tokens";

const LANGUAGES = ["json", "plaintext", "xml", "html", "javascript"];
let registered = false;

const clip = (s: string) => (s.length > 300 ? `${s.slice(0, 300)}...` : s);

function markdown(name: string, s: VariableSummary): string {
  const title = `**\`{{${name}}}\`**${s.scope ? ` · ${s.scope}` : ""}`;
  const extra = s.unresolved.length > 0 ? `\n\nUses undefined: ${s.unresolved.join(", ")}` : "";
  switch (s.kind) {
    case "undefined":
      return `${title}\n\nNot defined. Select an environment or add it under Variables. It is sent as written.`;
    case "cyclic":
      return `${title}\n\nThis variable refers to itself.`;
    case "secret":
      return `${title}\n\nSecret value (hidden)`;
    case "builtin":
      return `${title}\n\nGenerated on every send${s.value ? `. Example: \`${clip(s.value)}\`` : "."}`;
    default:
      return `${title}\n\n${s.value ? `\`\`\`\n${clip(s.value)}\n\`\`\`` : "_(empty)_"}${extra}`;
  }
}

/** Hover details for {{variables}} in every editor. Only the current line is scanned, so it's cheap. */
export function registerVariableHover() {
  if (registered) return;
  registered = true;
  for (const language of LANGUAGES) {
    monaco.languages.registerHoverProvider(language, {
      async provideHover(model, position) {
        const line = model.getLineContent(position.lineNumber);
        const column = position.column - 1;
        const token = findVariables(line).find((t) => column >= t.start && column <= t.end);
        if (!token) return null;

        const { context, activeEnvId, version } = useVariablesStore.getState();
        const info = context[token.name];
        const tabs = useTabsStore.getState();
        const requestPath = tabs.tabs.find((t) => t.id === tabs.activeTabId)?.path ?? null;
        const resolution =
          info && !info.secret
            ? await previewVariable(token.name, activeEnvId, requestPath, version).catch(() => null)
            : null;

        return {
          range: new monaco.Range(
            position.lineNumber,
            token.start + 1,
            position.lineNumber,
            token.end + 1,
          ),
          contents: [{ value: markdown(token.name, summarize(info, resolution)) }],
        };
      },
    });
  }
}
