import { create } from "zustand";

export type UnsavedChoice = "save" | "discard" | "cancel";
/** parentPath "" means "no collection exists yet: create a default one". */
export interface SaveLocation {
  parentPath: string;
  name: string;
}

export type DialogRequest =
  | {
      kind: "name";
      title: string;
      label: string;
      initial: string;
      confirmLabel: string;
      resolve: (v: string | null) => void;
    }
  | {
      kind: "confirm";
      title: string;
      description: string;
      confirmLabel: string;
      destructive: boolean;
      resolve: (v: boolean) => void;
    }
  | { kind: "unsaved"; name: string; resolve: (v: UnsavedChoice) => void }
  | { kind: "location"; initialName: string; resolve: (v: SaveLocation | null) => void };

interface DialogsState {
  current: DialogRequest | null;
  /** Bumped per request so each dialog mounts fresh. */
  version: number;
  askName: (o: {
    title: string;
    label?: string;
    initial?: string;
    confirmLabel?: string;
  }) => Promise<string | null>;
  askConfirm: (o: {
    title: string;
    description: string;
    confirmLabel?: string;
    destructive?: boolean;
  }) => Promise<boolean>;
  askUnsaved: (name: string) => Promise<UnsavedChoice>;
  askLocation: (initialName: string) => Promise<SaveLocation | null>;
  close: () => void;
}

export const useDialogs = create<DialogsState>()((set, get) => {
  const ask = <T>(build: (resolve: (value: T) => void) => DialogRequest) =>
    new Promise<T>((resolve) => set({ current: build(resolve), version: get().version + 1 }));

  return {
    current: null,
    version: 0,
    askName: ({ title, label = "Name", initial = "", confirmLabel = "Save" }) =>
      ask<string | null>((resolve) => ({
        kind: "name",
        title,
        label,
        initial,
        confirmLabel,
        resolve,
      })),
    askConfirm: ({ title, description, confirmLabel = "Confirm", destructive = false }) =>
      ask<boolean>((resolve) => ({
        kind: "confirm",
        title,
        description,
        confirmLabel,
        destructive,
        resolve,
      })),
    askUnsaved: (name) => ask<UnsavedChoice>((resolve) => ({ kind: "unsaved", name, resolve })),
    askLocation: (initialName) =>
      ask<SaveLocation | null>((resolve) => ({ kind: "location", initialName, resolve })),
    close: () => set({ current: null }),
  };
});
