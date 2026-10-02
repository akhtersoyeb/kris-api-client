import { useEffect, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useTabsStore } from "@/store/tabs";
import { useThemeStore } from "@/store/theme";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const openTab = useTabsStore((s) => s.openTab);
  const closeTab = useTabsStore((s) => s.closeTab);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const setTheme = useThemeStore((s) => s.setTheme);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command..." />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Requests">
          <CommandItem onSelect={run(() => openTab())}>New request</CommandItem>
          {activeTabId && (
            <CommandItem onSelect={run(() => closeTab(activeTabId))}>Close current tab</CommandItem>
          )}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Theme">
          <CommandItem onSelect={run(() => setTheme("light"))}>Light</CommandItem>
          <CommandItem onSelect={run(() => setTheme("dark"))}>Dark</CommandItem>
          <CommandItem onSelect={run(() => setTheme("system"))}>System</CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
