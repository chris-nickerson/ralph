import { describe, it, expect } from "vitest";
import { parseSignal } from "../src/signal.js";

describe("parseSignal", () => {
  it("returns value when signal is the last line", () => {
    expect(parseSignal("some output\n<signal>PLAN_READY</signal>")).toBe("PLAN_READY");
  });

  it("returns value when last line has trailing newline", () => {
    expect(parseSignal("output\n<signal>APPROVED</signal>\n")).toBe("APPROVED");
  });

  it("returns value with trailing whitespace", () => {
    expect(parseSignal("output\n<signal>NEEDS_REVISION</signal>  \n")).toBe("NEEDS_REVISION");
  });

  it("returns null when signal appears mid-text", () => {
    expect(parseSignal("The signal was <signal>PLAN_READY</signal>\nmore text after")).toBeNull();
  });

  it("returns null when no signal present", () => {
    expect(parseSignal("just normal output")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseSignal("")).toBeNull();
  });

  it("is case-sensitive and returns exact token", () => {
    expect(parseSignal("<signal>plan_ready</signal>")).toBe("plan_ready");
  });

  it("does not match the old done format", () => {
    expect(parseSignal("<done>PLAN_READY</done>")).toBeNull();
  });
});
