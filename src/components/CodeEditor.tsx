import { useCallback, useEffect, useRef } from "react";
import Editor, { type Monaco, type OnMount } from "@monaco-editor/react";
import "@/lib/monaco";
import { registerVariableHover } from "@/features/variables/monaco-hover";
import { findVariables } from "@/features/variables/tokens";
import { useThemeStore } from "@/store/theme";
import { useVariablesStore } from "@/store/variables";

registerVariableHover();

interface Props {
  value: string;
  onChange?: (value: string) => void;
  language?: string;
  readOnly?: boolean;
  wordWrap?: boolean;
  /** A unique path gives each editor its own model and undo history. */
  path?: string;
  /** Highlight {{variables}} (request editors only; the response viewer leaves this off). */
  highlightVariables?: boolean;
}

type CodeEditorInstance = Parameters<OnMount>[0];

export function CodeEditor({
  value,
  onChange,
  language = "plaintext",
  readOnly = false,
  wordWrap = false,
  path,
  highlightVariables = false,
}: Props) {
  const isDark = useThemeStore((s) => s.isDark);
  const context = useVariablesStore((s) => s.context);
  const editorRef = useRef<CodeEditorInstance | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const decorationsRef = useRef<ReturnType<
    CodeEditorInstance["createDecorationsCollection"]
  > | null>(null);

  const applyDecorations = useCallback(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor?.getModel();
    if (!editor || !monaco || !model || !highlightVariables) {
      decorationsRef.current?.clear();
      return;
    }
    const known = useVariablesStore.getState().context;
    const decorations = findVariables(model.getValue()).map((token) => {
      const start = model.getPositionAt(token.start);
      const end = model.getPositionAt(token.end);
      return {
        range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
        options: { inlineClassName: known[token.name] ? "var-known" : "var-unknown" },
      };
    });
    decorationsRef.current ??= editor.createDecorationsCollection();
    decorationsRef.current.set(decorations);
  }, [highlightVariables]);

  // Re-run whenever the text, the known variables or the model (path) change.
  useEffect(applyDecorations, [applyDecorations, value, context, path]);

  return (
    <Editor
      height="100%"
      path={path}
      language={language}
      value={value}
      theme={isDark ? "vs-dark" : "vs"}
      onChange={(v) => onChange?.(v ?? "")}
      onMount={(editor, monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;
        applyDecorations();
      }}
      loading={<div className="p-3 text-sm text-muted-foreground">Loading editor...</div>}
      options={{
        readOnly,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        fontSize: 13,
        tabSize: 2,
        wordWrap: wordWrap ? "on" : "off",
      }}
    />
  );
}
