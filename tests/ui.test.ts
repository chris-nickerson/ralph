import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";

const mockReadline = vi.hoisted(() => ({
  createInterface: vi.fn(),
}));

vi.mock("node:readline", () => ({
  createInterface: mockReadline.createInterface,
}));

import { formatDuration, line, confirm } from "../src/ui.js";

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

describe("confirm", () => {
  let origIsTTY: boolean | undefined;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    origIsTTY = process.stdin.isTTY;
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, "isTTY", {
      value: origIsTTY,
      configurable: true,
    });
    stdoutSpy.mockRestore();
  });

  function makeMockRl() {
    const rl = new EventEmitter();
    (rl as any).close = vi.fn();
    mockReadline.createInterface.mockReturnValue(rl);
    return rl;
  }

  it("returns true when force is set", async () => {
    expect(await confirm("Continue?", "n", true)).toBe(true);
  });

  it("throws in non-interactive mode", async () => {
    Object.defineProperty(process.stdin, "isTTY", {
      value: false,
      configurable: true,
    });
    await expect(confirm("Continue?")).rejects.toThrow(
      "non-interactive mode; use --force to proceed",
    );
  });

  it("resolves true for 'y' input", async () => {
    Object.defineProperty(process.stdin, "isTTY", {
      value: true,
      configurable: true,
    });
    const rl = makeMockRl();
    const promise = confirm("Continue?");
    rl.emit("line", "y");
    expect(await promise).toBe(true);
  });

  it("resolves false for 'n' input", async () => {
    Object.defineProperty(process.stdin, "isTTY", {
      value: true,
      configurable: true,
    });
    const rl = makeMockRl();
    const promise = confirm("Continue?");
    rl.emit("line", "n");
    expect(await promise).toBe(false);
  });

  it("uses default value on empty input", async () => {
    Object.defineProperty(process.stdin, "isTTY", {
      value: true,
      configurable: true,
    });
    const rl = makeMockRl();
    const promise = confirm("Continue?", "y");
    rl.emit("line", "");
    expect(await promise).toBe(true);
  });

  it("resolves false on EOF (readline close without input)", async () => {
    Object.defineProperty(process.stdin, "isTTY", {
      value: true,
      configurable: true,
    });
    const rl = makeMockRl();
    const promise = confirm("Continue?");
    rl.emit("close");
    expect(await promise).toBe(false);
  });
});
