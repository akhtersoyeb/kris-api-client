import { useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VariableInput } from "@/features/variables/VariableInput";
import type { AuthConfig } from "@/lib/bindings";
import { isLiteralSecret } from "./secrets-hint";

type AuthType = AuthConfig["type"];

const LABELS: Record<AuthType, string> = {
  inherit: "Inherit from collection",
  none: "No auth",
  basic: "Basic auth",
  bearer: "Bearer token",
  apiKey: "API key",
};

function blank(type: AuthType): AuthConfig {
  switch (type) {
    case "inherit":
      return { type };
    case "none":
      return { type };
    case "basic":
      return { type, username: "", password: "" };
    case "bearer":
      return { type, token: "", prefix: "Bearer" };
    case "apiKey":
      return { type, key: "", value: "", location: "header" };
  }
}

const selectClass = "h-9 w-full rounded-md border bg-background px-2 text-sm";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

function SecretField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [shown, setShown] = useState(false);
  return (
    <Field label={label}>
      <div className="flex gap-1">
        <Input
          type={shown ? "text" : "password"}
          autoComplete="off"
          spellCheck={false}
          value={value}
          className="font-mono"
          onChange={(e) => onChange(e.target.value)}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={shown ? "Hide value" : "Show value"}
          onClick={() => setShown((s) => !s)}
        >
          {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </Button>
      </div>
      {isLiteralSecret(value) ? (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          This is saved in plain text in the workspace file, so it can end up in Git. Store it as a
          secret variable and use {"{{name}}"} here instead.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">You can use {"{{variables}}"} here.</p>
      )}
    </Field>
  );
}

interface Props {
  value: AuthConfig;
  onChange: (value: AuthConfig) => void;
  /** Requests can inherit from their collection; a collection can't. */
  allowInherit: boolean;
  /** Shown under the type picker when "inherit" is selected. */
  inheritedNote?: ReactNode;
}

export function AuthEditor({ value, onChange, allowInherit, inheritedNote }: Props) {
  const types = (Object.keys(LABELS) as AuthType[]).filter((t) => allowInherit || t !== "inherit");
  return (
    <div className="max-w-xl space-y-4 p-4">
      <Field label="Type">
        <select
          className={selectClass}
          value={value.type}
          onChange={(e) => onChange(blank(e.target.value as AuthType))}
        >
          {types.map((t) => (
            <option key={t} value={t}>
              {LABELS[t]}
            </option>
          ))}
        </select>
      </Field>

      {value.type === "inherit" && (
        <div className="text-sm text-muted-foreground">{inheritedNote}</div>
      )}
      {value.type === "none" && (
        <p className="text-sm text-muted-foreground">No credentials are added to this request.</p>
      )}

      {value.type === "basic" && (
        <>
          <Field label="Username">
            <VariableInput
              value={value.username}
              inputClassName="font-mono"
              onChange={(username) => onChange({ ...value, username })}
            />
          </Field>
          <SecretField
            label="Password"
            value={value.password}
            onChange={(password) => onChange({ ...value, password })}
          />
        </>
      )}

      {value.type === "bearer" && (
        <>
          <SecretField
            label="Token"
            value={value.token}
            onChange={(token) => onChange({ ...value, token })}
          />
          <Field label="Prefix">
            <VariableInput
              value={value.prefix}
              placeholder="Bearer"
              inputClassName="font-mono"
              onChange={(prefix) => onChange({ ...value, prefix })}
            />
          </Field>
        </>
      )}

      {value.type === "apiKey" && (
        <>
          <Field label="Key name">
            <VariableInput
              value={value.key}
              placeholder="X-Api-Key"
              inputClassName="font-mono"
              onChange={(key) => onChange({ ...value, key })}
            />
          </Field>
          <SecretField
            label="Value"
            value={value.value}
            onChange={(v) => onChange({ ...value, value: v })}
          />
          <Field label="Add to">
            <select
              className={selectClass}
              value={value.location}
              onChange={(e) =>
                onChange({ ...value, location: e.target.value === "query" ? "query" : "header" })
              }
            >
              <option value="header">Header</option>
              <option value="query">Query string</option>
            </select>
          </Field>
        </>
      )}
    </div>
  );
}
