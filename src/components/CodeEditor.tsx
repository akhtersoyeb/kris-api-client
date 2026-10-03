import Editor from "@monaco-editor/react";
import "@/lib/monaco";
import { useThemeStore } from "@/store/theme";

interface Props {
  value: string;
  onChange?: (value: string) => void;
  language?: string;
  readOnly?: boolean;
  wordWrap?: boolean;
  /** A unique path gives each editor its own model and undo history. */
  path?: string;
}

export function CodeEditor({
  value,
  onChange,
  language = "plaintext",
  readOnly = false,
  wordWrap = false,
  path,
}: Props) {
  const isDark = useThemeStore((s) => s.isDark);

  return (
    <Editor
      height="100%"
      path={path}
      language={language}
      value={value}
      theme={isDark ? "vs-dark" : "vs"}
      onChange={(v) => onChange?.(v ?? "")}
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
