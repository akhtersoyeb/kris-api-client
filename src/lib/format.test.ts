import { describe, expect, it } from "vitest";
import { formatBytes, formatDuration, statusTone } from "./format";

describe("format", () => {
  it("formats bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1536)).toBe("1.50 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.00 MB");
  });

  it("formats durations", () => {
    expect(formatDuration(850)).toBe("850 ms");
    expect(formatDuration(1234)).toBe("1.23 s");
  });

  it("classifies statuses", () => {
    expect(statusTone(204)).toBe("success");
    expect(statusTone(302)).toBe("redirect");
    expect(statusTone(404)).toBe("client");
    expect(statusTone(503)).toBe("server");
  });
});
