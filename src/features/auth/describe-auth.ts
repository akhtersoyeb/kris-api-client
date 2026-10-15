import type { AuthConfig } from "@/lib/bindings";

/** A short human description, for example "Bearer token". Null means "couldn't be loaded". */
export function describeAuth(auth: AuthConfig | null): string {
  if (!auth) return "No auth";
  switch (auth.type) {
    case "inherit":
    case "none":
      return "No auth";
    case "basic":
      return auth.username ? `Basic auth (${auth.username})` : "Basic auth";
    case "bearer":
      return "Bearer token";
    case "apiKey":
      return `API key${auth.key ? ` "${auth.key}"` : ""} in the ${auth.location === "header" ? "header" : "query string"}`;
  }
}
