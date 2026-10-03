import { describe, expect, it } from "vitest";
import { detectLanguage, formatJsonText } from "./body-format";

describe("formatJsonText", () => {
  it("indents nested structures and keeps empty containers compact", () => {
    expect(formatJsonText('{"a":1,"b":[1,2,{"c":"x,y"}],"d":{},"e":[]}')).toBe(`{
  "a": 1,
  "b": [
    1,
    2,
    {
      "c": "x,y"
    }
  ],
  "d": {},
  "e": []
}`);
  });

  it("does not alter numbers beyond 2^53", () => {
    expect(formatJsonText('{"id":12345678901234567890}')).toContain("12345678901234567890");
  });

  it("ignores structural characters inside strings", () => {
    expect(formatJsonText('{"a":"{[,]}\\"x"}')).toContain('"{[,]}\\"x"');
  });
});

describe("detectLanguage", () => {
  it("uses the content type first", () => {
    expect(detectLanguage("application/problem+json", "x")).toBe("json");
    expect(detectLanguage("text/html; charset=utf-8", "<p>")).toBe("html");
  });

  it("sniffs json when the content type is unhelpful", () => {
    expect(detectLanguage("text/plain", '{"a":1}')).toBe("json");
    expect(detectLanguage("text/plain", "{not json")).toBe("plaintext");
  });
});
