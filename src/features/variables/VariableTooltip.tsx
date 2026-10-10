import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Resolution } from "@/lib/bindings";
import { useTabsStore } from "@/store/tabs";
import { useVariablesStore } from "@/store/variables";
import { summarize, type VariableSummary } from "./describe";
import { previewVariable } from "./preview";

export interface HoverTarget {
  name: string;
  /** Viewport coordinates of the token's bottom-left corner. */
  x: number;
  y: number;
}

const clip = (s: string) => (s.length > 300 ? `${s.slice(0, 300)}...` : s);

function Body({ name, s }: { name: string; s: VariableSummary }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <code className="font-semibold">{`{{${name}}}`}</code>
        {s.scope && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">{s.scope}</span>
        )}
      </div>
      {s.kind === "undefined" && (
        <p className="text-amber-600 dark:text-amber-400">
          Not defined. Select an environment or add it under Variables. Undefined names are sent as
          written.
        </p>
      )}
      {s.kind === "cyclic" && (
        <p className="text-amber-600 dark:text-amber-400">This variable refers to itself.</p>
      )}
      {s.kind === "secret" && <p className="text-muted-foreground">Secret value (hidden)</p>}
      {s.kind === "builtin" && (
        <p className="text-muted-foreground">
          Generated on every send
          {s.value ? (
            <>
              {" "}
              (example: <code>{clip(s.value)}</code>)
            </>
          ) : null}
          .
        </p>
      )}
      {s.kind === "defined" && (
        <p className="font-mono break-all">
          {s.value === "" ? (
            <em className="text-muted-foreground">(empty)</em>
          ) : (
            clip(s.value ?? "")
          )}
        </p>
      )}
      {s.unresolved.length > 0 && (
        <p className="text-amber-600 dark:text-amber-400">
          Uses undefined: {s.unresolved.join(", ")}
        </p>
      )}
    </div>
  );
}

export function VariableTooltip({ target }: { target: HoverTarget | null }) {
  const name = target?.name ?? null;
  const info = useVariablesStore((s) => (name ? s.context[name] : undefined));
  const envId = useVariablesStore((s) => s.activeEnvId);
  const version = useVariablesStore((s) => s.version);
  const requestPath = useTabsStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.path ?? null);
  const [preview, setPreview] = useState<{ name: string; resolution: Resolution } | null>(null);

  const needsPreview = !!name && !!info && !info.secret;
  useEffect(() => {
    if (!needsPreview || !name) return;
    let live = true;
    const timer = setTimeout(() => {
      previewVariable(name, envId, requestPath, version)
        .then((resolution) => live && setPreview({ name, resolution }))
        .catch(() => undefined); // the tooltip falls back to the raw value
    }, 120);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [needsPreview, name, envId, requestPath, version]);

  if (!target || !name) return null;
  const resolution = preview?.name === name ? preview.resolution : null;
  return createPortal(
    <div
      role="tooltip"
      style={{
        position: "fixed",
        left: Math.max(8, Math.min(target.x, window.innerWidth - 340)),
        top: target.y + 6,
      }}
      className="pointer-events-none z-100 max-w-xs rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
    >
      <Body name={name} s={summarize(info, resolution)} />
    </div>,
    document.body,
  );
}
