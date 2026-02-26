import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";

import { AGENTS, validateAgent } from "../src/agent.js";
import type { RalphOptions } from "../src/agent.js";

describe("AGENTS map", () => {
  it("has claude with correct config", () => {
    expect(AGENTS.claude).toEqual({
      name: "claude",
      command: "claude",
      args: ["-p", "--dangerously-skip-permissions"],
    });
  });

  it("has codex with correct config", () => {
    expect(AGENTS.codex).toEqual({
      name: "codex",
      command: "codex",
      args: ["exec", "--yolo"],
    });
  });

  it("has cursor with correct config", () => {
    expect(AGENTS.cursor).toEqual({
      name: "cursor",
      command: "agent",
      args: ["-p", "-f"],
    });
  });

  it("has exactly three agents", () => {
    expect(Object.keys(AGENTS)).toEqual(["claude", "codex", "cursor"]);
  });
});

describe("validateAgent", () => {
  it("returns config for valid agent", () => {
    expect(validateAgent("claude")).toBe(AGENTS.claude);
    expect(validateAgent("codex")).toBe(AGENTS.codex);
    expect(validateAgent("cursor")).toBe(AGENTS.cursor);
  });

  it("throws for unknown agent", () => {
    expect(() => validateAgent("gpt")).toThrow("unknown agent 'gpt'");
  });

  it("includes supported agents in error message", () => {
    expect(() => validateAgent("bad")).toThrow(
      "Supported agents: claude, codex, cursor",
    );
  });
});

describe("runAgent", () => {
  const makeOptions = (overrides: Partial<RalphOptions> = {}): RalphOptions => ({
    agent: "claude",
    debug: false,
    force: false,
    noCommit: false,
    noReview: false,
    worktree: false,
    timeout: 0,
    ...overrides,
  });

  let spawnMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createMockChild() {
    const child = new EventEmitter() as EventEmitter & {
      stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
      stdout: EventEmitter;
      stderr: EventEmitter;
    };
    const stdinEmitter = new EventEmitter();
    child.stdin = Object.assign(stdinEmitter, { write: vi.fn(), end: vi.fn() });
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    (child as any).kill = vi.fn();
    return child;
  }

  it("spawns agent with correct command and args", async () => {
    const mockChild = createMockChild();
    spawnMock = vi.fn().mockReturnValue(mockChild);

    vi.doMock("node:child_process", () => ({
      spawn: spawnMock,
      execFileSync: vi.fn(),
    }));

    vi.doMock("ora", () => ({
      default: () => ({
        start: vi.fn().mockReturnThis(),
        stop: vi.fn(),
        set text(_: string) {},
      }),
    }));

    const { runAgent } = await import("../src/agent.js");

    const resultPromise = runAgent(
      "test prompt",
      AGENTS.claude,
      makeOptions(),
      "building",
      Date.now(),
    );

    mockChild.stdout.emit("data", Buffer.from("output text"));
    mockChild.emit("close", 0);

    const result = await resultPromise;

    expect(spawnMock).toHaveBeenCalledWith("claude", ["-p", "--dangerously-skip-permissions"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    expect(mockChild.stdin.write).toHaveBeenCalledWith("test prompt");
    expect(mockChild.stdin.end).toHaveBeenCalled();
    expect(result.output).toBe("output text");
    expect(result.exitCode).toBe(0);
  });

  it("captures output and returns correct exit code on failure", async () => {
    const mockChild = createMockChild();
    spawnMock = vi.fn().mockReturnValue(mockChild);

    vi.doMock("node:child_process", () => ({
      spawn: spawnMock,
      execFileSync: vi.fn(),
    }));

    vi.doMock("ora", () => ({
      default: () => ({
        start: vi.fn().mockReturnThis(),
        stop: vi.fn(),
        set text(_: string) {},
      }),
    }));

    const { runAgent } = await import("../src/agent.js");

    const resultPromise = runAgent(
      "prompt",
      AGENTS.codex,
      makeOptions(),
      "building",
      Date.now(),
    );

    mockChild.stdout.emit("data", Buffer.from("some output"));
    mockChild.emit("close", 2);

    const result = await resultPromise;
    expect(result.exitCode).toBe(2);
    expect(result.output).toBe("some output");
  });

  it("uses debug mode when options.debug is true", async () => {
    const mockChild = createMockChild();
    spawnMock = vi.fn().mockReturnValue(mockChild);

    vi.doMock("node:child_process", () => ({
      spawn: spawnMock,
      execFileSync: vi.fn(),
    }));

    vi.doMock("ora", () => ({
      default: () => ({
        start: vi.fn().mockReturnThis(),
        stop: vi.fn(),
        set text(_: string) {},
      }),
    }));

    const { runAgent } = await import("../src/agent.js");

    const resultPromise = runAgent(
      "debug prompt",
      AGENTS.claude,
      makeOptions({ debug: true }),
      "planning",
      Date.now(),
    );

    mockChild.stdout.emit("data", Buffer.from("debug output"));
    mockChild.emit("close", 0);

    const result = await resultPromise;
    expect(result.output).toBe("debug output");
    expect(result.exitCode).toBe(0);
  });

  it("handles spawn error gracefully", async () => {
    const mockChild = createMockChild();
    spawnMock = vi.fn().mockReturnValue(mockChild);

    vi.doMock("node:child_process", () => ({
      spawn: spawnMock,
      execFileSync: vi.fn(),
    }));

    vi.doMock("ora", () => ({
      default: () => ({
        start: vi.fn().mockReturnThis(),
        stop: vi.fn(),
        set text(_: string) {},
      }),
    }));

    const { runAgent } = await import("../src/agent.js");

    const resultPromise = runAgent(
      "prompt",
      AGENTS.claude,
      makeOptions(),
      "building",
      Date.now(),
    );

    mockChild.emit("error", new Error("spawn ENOENT"));

    const result = await resultPromise;
    expect(result.exitCode).toBe(1);
    expect(result.output).toBe("");
  });

  it("kills child process when timeout fires", async () => {
    vi.useFakeTimers();

    const mockChild = createMockChild();
    spawnMock = vi.fn().mockReturnValue(mockChild);

    vi.doMock("node:child_process", () => ({
      spawn: spawnMock,
      execFileSync: vi.fn(),
    }));

    vi.doMock("ora", () => ({
      default: () => ({
        start: vi.fn().mockReturnThis(),
        stop: vi.fn(),
        set text(_: string) {},
      }),
    }));

    const { runAgent } = await import("../src/agent.js");

    const resultPromise = runAgent(
      "prompt",
      AGENTS.claude,
      makeOptions({ timeout: 2 }),
      "building",
      Date.now(),
    );

    await vi.advanceTimersByTimeAsync(2000);

    expect((mockChild as any).kill).toHaveBeenCalled();

    mockChild.emit("close", null);

    const result = await resultPromise;
    expect(result.exitCode).toBe(1);

    vi.useRealTimers();
  });
});
