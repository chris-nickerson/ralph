import { describe, it, expect } from "vitest";

import { formatDuration, line } from "../src/ui.js";

describe("line", () => {
  it("returns 74 dashes", () => {
    const result = line();
    expect(result).toBe("-".repeat(74));
    expect(result.length).toBe(74);
  });
});

describe("formatDuration", () => {
  it("formats 0 seconds", () => {
    expect(formatDuration(0)).toBe("0s");
  });

  it("formats seconds under a minute", () => {
    expect(formatDuration(30)).toBe("30s");
  });

  it("formats exactly 59 seconds", () => {
    expect(formatDuration(59)).toBe("59s");
  });

  it("formats minutes and seconds", () => {
    expect(formatDuration(90)).toBe("1m 30s");
  });

  it("formats exact minutes", () => {
    expect(formatDuration(120)).toBe("2m 0s");
  });

  it("formats hours and minutes", () => {
    expect(formatDuration(3661)).toBe("1h 1m");
  });

  it("formats exactly one hour", () => {
    expect(formatDuration(3600)).toBe("1h 0m");
  });

  it("formats large durations", () => {
    expect(formatDuration(7200)).toBe("2h 0m");
  });
});
