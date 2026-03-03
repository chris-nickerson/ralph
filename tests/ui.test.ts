import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";

const mockReadline = vi.hoisted(() => ({
  createInterface: vi.fn(),
}));

vi.mock("node:readline", () => ({
  createInterface: mockReadline.createInterface,
}));

import { formatDuration, secondsSince, line, confirm, MultiSpinner, isUtf8, SPINNER_INTERVAL_MS, printPhase, printStep, printLimitReached, printTimingSummary } from "../src/ui.js";

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
    expect(formatDuration(120)).toBe("2m");
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

describe("printPhase", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("prints without elapsed", () => {
    printPhase(1, "build");
    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("iteration 1");
    expect(output).toContain("build");
  });

  it("prints with detail but no elapsed", () => {
    printPhase(2, "build", "3 tasks remaining");
    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("iteration 2");
    expect(output).toContain("build");
    expect(output).toContain("3 tasks remaining");
  });

  it("prints with elapsed but no detail", () => {
    printPhase(1, "review", undefined, 90);
    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("iteration 1");
    expect(output).toContain("review");
    expect(output).toContain("1m 30s");
  });

  it("prints with both detail and elapsed", () => {
    printPhase(2, "build", "2 tasks remaining", 45);
    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("iteration 2");
    expect(output).toContain("build");
    expect(output).toContain("2 tasks remaining");
    expect(output).toContain("45s");
  });
});

describe("printStep", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("prints without elapsed", () => {
    printStep(1, "specialists", "4 parallel reviews");
    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("step 1");
    expect(output).toContain("specialists");
    expect(output).toContain("4 parallel reviews");
  });

  it("prints with elapsed but no detail", () => {
    printStep(2, "synthesis", undefined, 135);
    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("step 2");
    expect(output).toContain("synthesis");
    expect(output).toContain("2m 15s");
  });

  it("prints with both detail and elapsed", () => {
    printStep(1, "specialists", "4 parallel reviews", 30);
    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("step 1");
    expect(output).toContain("specialists");
    expect(output).toContain("4 parallel reviews");
    expect(output).toContain("30s");
  });

  it("prints without detail or elapsed", () => {
    printStep(3, "verification");
    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("step 3");
    expect(output).toContain("verification");
  });
});

describe("printLimitReached", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("prints with elapsed", () => {
    printLimitReached(10, "ralph", "build", false, 930);
    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("iteration limit reached (10)");
    expect(output).toContain("15m 30s");
  });

  it("prints without elapsed (backward-compatible)", () => {
    printLimitReached(5, "ralph", "build", false);
    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("iteration limit reached (5)");
  });
});

describe("printTimingSummary", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("prints step and total durations", () => {
    printTimingSummary(45, 135);
    const output = String(consoleSpy.mock.calls[0][0]);
    expect(output).toContain("45s elapsed");
    expect(output).toContain("2m 15s total");
  });

  it("formats both durations correctly", () => {
    printTimingSummary(10, 3661);
    const output = String(consoleSpy.mock.calls[0][0]);
    expect(output).toContain("10s elapsed");
    expect(output).toContain("1h 1m total");
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
    (rl as any).close = vi.fn(() => rl.emit("close"));
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

describe("MultiSpinner", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
  });

  afterEach(() => {
    vi.useRealTimers();
    stdoutSpy.mockRestore();
  });

  function allOutput(): string {
    return stdoutSpy.mock.calls.map((c) => String(c[0])).join("");
  }

  describe("TTY mode", () => {
    it("start() writes one line per label", () => {
      const spinner = new MultiSpinner({
        labels: ["Alpha", "Beta"],
        startTime: Date.now(),
        isTTY: true,
      });
      spinner.start();
      const output = allOutput();
      expect(output).toContain("Alpha");
      expect(output).toContain("Beta");
      spinner.stop();
    });

    it("succeed(i) shows success marker on next render", () => {
      const spinner = new MultiSpinner({
        labels: ["Alpha", "Beta"],
        startTime: Date.now(),
        isTTY: true,
      });
      spinner.start();

      vi.advanceTimersByTime(5000);
      spinner.succeed(0);
      stdoutSpy.mockClear();

      vi.advanceTimersByTime(500);
      const output = allOutput();
      const mark = isUtf8 ? "✓" : "done";
      expect(output).toContain(mark);
      expect(output).toContain("Alpha");
      spinner.stop();
    });

    it("fail(i) shows failure marker on next render", () => {
      const spinner = new MultiSpinner({
        labels: ["Alpha", "Beta"],
        startTime: Date.now(),
        isTTY: true,
      });
      spinner.start();

      vi.advanceTimersByTime(3000);
      spinner.fail(1);
      stdoutSpy.mockClear();

      vi.advanceTimersByTime(500);
      const output = allOutput();
      const mark = isUtf8 ? "✗" : "fail";
      expect(output).toContain(mark);
      expect(output).toContain("Beta");
      spinner.stop();
    });

    it("stop() clears the interval", () => {
      const spinner = new MultiSpinner({
        labels: ["Alpha"],
        startTime: Date.now(),
        isTTY: true,
      });
      spinner.start();
      spinner.stop();
      stdoutSpy.mockClear();

      vi.advanceTimersByTime(2000);
      expect(stdoutSpy).not.toHaveBeenCalled();
    });

    it("freezes elapsed time for completed lines", () => {
      const start = Date.now();
      const spinner = new MultiSpinner({
        labels: ["Alpha", "Beta"],
        startTime: start,
        isTTY: true,
      });
      spinner.start();

      vi.advanceTimersByTime(5000);
      spinner.succeed(0);
      vi.advanceTimersByTime(5000);
      stdoutSpy.mockClear();

      vi.advanceTimersByTime(500);
      const output = allOutput();
      expect(output).toContain("5s");
      expect(output).toContain("10s");
      spinner.stop();
    });
  });

  describe("non-TTY mode", () => {
    it("start() writes one line per label with bullet", () => {
      const spinner = new MultiSpinner({
        labels: ["Alpha", "Beta"],
        startTime: Date.now(),
        isTTY: false,
      });
      spinner.start();
      const output = allOutput();
      const bullet = isUtf8 ? "▸" : ">";
      expect(output).toContain(`${bullet} Alpha`);
      expect(output).toContain(`${bullet} Beta`);
      spinner.stop();
    });

    it("succeed(i) logs a completion line", () => {
      vi.advanceTimersByTime(8000);
      const spinner = new MultiSpinner({
        labels: ["Alpha"],
        startTime: Date.now() - 8000,
        isTTY: false,
      });
      spinner.start();
      stdoutSpy.mockClear();

      spinner.succeed(0);
      const output = allOutput();
      const mark = isUtf8 ? "✓" : "done";
      expect(output).toContain(mark);
      expect(output).toContain("Alpha");
      expect(output).toContain("8s");
      spinner.stop();
    });

    it("fail(i) logs a failure line", () => {
      vi.advanceTimersByTime(6000);
      const spinner = new MultiSpinner({
        labels: ["Alpha"],
        startTime: Date.now() - 6000,
        isTTY: false,
      });
      spinner.start();
      stdoutSpy.mockClear();

      spinner.fail(0);
      const output = allOutput();
      const mark = isUtf8 ? "✗" : "fail";
      expect(output).toContain(mark);
      expect(output).toContain("Alpha");
      expect(output).toContain("6s");
      spinner.stop();
    });

    it("does not use ANSI cursor movement", () => {
      const spinner = new MultiSpinner({
        labels: ["Alpha"],
        startTime: Date.now(),
        isTTY: false,
      });
      spinner.start();
      spinner.succeed(0);
      spinner.stop();
      const output = allOutput();
      expect(output).not.toContain("\x1b[");
    });
  });

  describe("totalStartTime footer", () => {
    it("renders a footer line containing 'total' in TTY mode", () => {
      const totalStart = Date.now() - 60000;
      const spinner = new MultiSpinner({
        labels: ["Alpha", "Beta"],
        startTime: Date.now(),
        isTTY: true,
        totalStartTime: totalStart,
      });
      spinner.start();
      const output = allOutput();
      expect(output).toContain("total");
      spinner.stop();
    });

    it("does not render footer when totalStartTime is not set in TTY mode", () => {
      const spinner = new MultiSpinner({
        labels: ["Alpha"],
        startTime: Date.now(),
        isTTY: true,
      });
      spinner.start();
      const output = allOutput();
      expect(output).not.toContain("total");
      spinner.stop();
    });

    it("prints footer on stop in non-TTY mode", () => {
      const totalStart = Date.now() - 120000;
      const spinner = new MultiSpinner({
        labels: ["Alpha"],
        startTime: Date.now(),
        isTTY: false,
        totalStartTime: totalStart,
      });
      spinner.start();
      stdoutSpy.mockClear();
      spinner.succeed(0);
      spinner.stop();
      const output = allOutput();
      expect(output).toContain("total");
    });

    it("does not print footer on stop in non-TTY mode without totalStartTime", () => {
      const spinner = new MultiSpinner({
        labels: ["Alpha"],
        startTime: Date.now(),
        isTTY: false,
      });
      spinner.start();
      stdoutSpy.mockClear();
      spinner.succeed(0);
      spinner.stop();
      const output = allOutput();
      expect(output).not.toContain("total");
    });
  });

  describe("per-line colors", () => {
    it("applies color function to spinning lines in TTY mode", () => {
      const colorFn = vi.fn((s: string) => `[${s}]`);
      const spinner = new MultiSpinner({
        labels: ["Alpha", "Beta"],
        startTime: Date.now(),
        colors: [colorFn, colorFn],
        isTTY: true,
      });
      spinner.start();
      vi.advanceTimersByTime(SPINNER_INTERVAL_MS * 2);
      const output = allOutput();
      expect(colorFn).toHaveBeenCalled();
      expect(output).toContain("[");
      spinner.stop();
    });

    it("does not apply per-line color after succeed/fail", () => {
      const colorFn = vi.fn((s: string) => `[${s}]`);
      const spinner = new MultiSpinner({
        labels: ["Alpha", "Beta"],
        startTime: Date.now(),
        colors: [colorFn, colorFn],
        isTTY: true,
      });
      spinner.start();
      spinner.succeed(0);
      spinner.fail(1);
      colorFn.mockClear();
      stdoutSpy.mockClear();

      vi.advanceTimersByTime(SPINNER_INTERVAL_MS * 2);
      const output = allOutput();
      const successMark = isUtf8 ? "✓" : "done";
      const failMark = isUtf8 ? "✗" : "fail";
      expect(output).toContain(successMark);
      expect(output).toContain(failMark);
      expect(colorFn).not.toHaveBeenCalled();
      spinner.stop();
    });
  });
});
