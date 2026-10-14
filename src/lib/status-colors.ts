import type { StatusTone } from "@/lib/format";

export const STATUS_TONE_CLASSES: Record<StatusTone, string> = {
  info: "bg-muted text-foreground",
  success: "bg-green-600/15 text-green-700 dark:text-green-400",
  redirect: "bg-blue-600/15 text-blue-700 dark:text-blue-400",
  client: "bg-amber-600/15 text-amber-700 dark:text-amber-400",
  server: "bg-red-600/15 text-red-700 dark:text-red-400",
};
