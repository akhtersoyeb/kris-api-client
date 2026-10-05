import { createContext } from "react";
import type { DropResult } from "./tree";

export const DropContext = createContext<DropResult | null>(null);
