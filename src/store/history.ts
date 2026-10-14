import { create } from "zustand";
import type { HistoryEntry } from "@/lib/bindings";

interface HistoryState {
  entries: HistoryEntry[];
  /** The sidebar search box. Empty means "show the latest". */
  query: string;
  hasMore: boolean;
  loading: boolean;
}

export const useHistoryStore = create<HistoryState>()(() => ({
  entries: [],
  query: "",
  hasMore: false,
  loading: false,
}));
