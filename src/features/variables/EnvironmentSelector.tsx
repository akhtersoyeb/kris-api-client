import { Braces } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useVariablesStore } from "@/store/variables";

const NONE = "__none__"; // Radix Select doesn't allow an empty-string value

export function EnvironmentSelector() {
  const environments = useVariablesStore((s) => s.environments);
  const activeEnvId = useVariablesStore((s) => s.activeEnvId);
  const setActive = useVariablesStore((s) => s.setActive);
  const openManager = useVariablesStore((s) => s.openManager);

  return (
    <div className="flex items-center gap-1">
      <Select value={activeEnvId ?? NONE} onValueChange={(v) => setActive(v === NONE ? null : v)}>
        <SelectTrigger className="h-7 w-44 text-xs" aria-label="Active environment">
          <SelectValue placeholder="No environment" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>No environment</SelectItem>
          {environments.map((e) => (
            <SelectItem key={e.id} value={e.id}>
              {e.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label="Manage variables"
        onClick={() => openManager()}
      >
        <Braces className="size-4" />
      </Button>
    </div>
  );
}
