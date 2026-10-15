import { describe, expect, it } from "vitest";
import { describeAuth } from "./describe-auth";
import { isLiteralSecret } from "./secrets-hint";

describe("isLiteralSecret", () => {
  it("flags typed secrets and ignores variables and empty values", () => {
    expect(isLiteralSecret("abc123")).toBe(true);
    expect(isLiteralSecret("Bearer abc123")).toBe(true);
    expect(isLiteralSecret("pre-{{token}}")).toBe(true);
    expect(isLiteralSecret("{{token}}")).toBe(false);
    expect(isLiteralSecret("Bearer {{token}}")).toBe(false);
    expect(isLiteralSecret("")).toBe(false);
  });
});

describe("describeAuth", () => {
  it("summarizes each type", () => {
    expect(describeAuth(null)).toBe("No auth");
    expect(describeAuth({ type: "none" })).toBe("No auth");
    expect(describeAuth({ type: "basic", username: "me", password: "x" })).toBe("Basic auth (me)");
    expect(describeAuth({ type: "bearer", token: "t", prefix: "Bearer" })).toBe("Bearer token");
    expect(describeAuth({ type: "apiKey", key: "k", value: "v", location: "query" })).toBe(
      'API key "k" in the query string',
    );
  });
});
