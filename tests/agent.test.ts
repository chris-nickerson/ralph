import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";

import { AGENTS, validateAgent, checkAgentInstalled } from "../src/agent.js";
import type { RalphOptions, AgentConfig } from "../src/agent.js";

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

describe("checkAgentInstalled", () => {
  it("does not throw when command exists in PATH", () => {
    expect(() => checkAgentInstalled({ name: "node", command: "node", args: [] })).not.toThrow();
  });

  it("throws when command is not found in PATH", () => {
    const fake: AgentConfig = { name: "fake", command: "ralph-nonexistent-binary-xyz", args: [] };
    expect(() => checkAgentInstalled(fake)).toThrow("'ralph-nonexistent-binary-xyz' CLI not found in PATH");
  });
});

describe("runAgent", () => {
  const makeOptions = (overrides: Partial<RalphOptions> = {}): RalphOptions => ({
    agent: "claude",
    debug: false,
    force: false,
    noCommit: false,
    noRefine: false,
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
    );

    await vi.advanceTimersByTimeAsync(2000);

    expect((mockChild as any).kill).toHaveBeenCalled();

    mockChild.emit("close", null);

    const result = await resultPromise;
    expect(result.exitCode).toBe(1);

    vi.useRealTimers();
  });

  it("silent mode suppresses stdout output", async () => {
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

    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const { runAgent } = await import("../src/agent.js");

    const resultPromise = runAgent(
      "test prompt",
      AGENTS.claude,
      makeOptions(),
      "building",
      true,
    );

    mockChild.stdout.emit("data", Buffer.from("silent output"));
    mockChild.emit("close", 0);

    const result = await resultPromise;
    expect(result.output).toBe("silent output");
    expect(result.exitCode).toBe(0);

    const stdoutCalls = stdoutSpy.mock.calls.map(c => String(c[0]));
    expect(stdoutCalls.some(s => s.includes("silent output"))).toBe(false);

    stdoutSpy.mockRestore();
  });
});

describe("killAgent", () => {
  let spawnMock: ReturnType<typeof vi.fn>;

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

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("kills all tracked children", async () => {
    const child1 = createMockChild();
    const child2 = createMockChild();
    spawnMock = vi.fn()
      .mockReturnValueOnce(child1)
      .mockReturnValueOnce(child2);

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

    const { runAgent, killAgent } = await import("../src/agent.js");

    const opts = {
      agent: "claude", debug: false, force: false, noCommit: false,
      noRefine: false, noReview: false, worktree: false, timeout: 0,
    } as RalphOptions;

    const p1 = runAgent("prompt1", AGENTS.claude, opts, "building");
    const p2 = runAgent("prompt2", AGENTS.claude, opts, "building");

    killAgent();

    expect((child1 as any).kill).toHaveBeenCalled();
    expect((child2 as any).kill).toHaveBeenCalled();

    child1.emit("close", 1);
    child2.emit("close", 1);
    await p1;
    await p2;
  });
});

describe("runAgentsParallel", () => {
  const makeOptions = (overrides: Partial<RalphOptions> = {}): RalphOptions => ({
    agent: "claude",
    debug: false,
    force: false,
    noCommit: false,
    noRefine: false,
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

  it("launches all agents and returns all results", async () => {
    const children = [createMockChild(), createMockChild(), createMockChild()];
    let childIdx = 0;
    spawnMock = vi.fn().mockImplementation(() => children[childIdx++]);

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

    const mockSpinner = { start: vi.fn(), succeed: vi.fn(), fail: vi.fn(), stop: vi.fn() };
    const MultiSpinnerMock = vi.fn().mockImplementation(() => mockSpinner);

    vi.doMock("../src/ui.js", () => ({
      isUtf8: false,
      dim: (s: string) => s,
      formatDuration: (s: number) => `${s}s`,
      printWarning: vi.fn(),
      MultiSpinner: MultiSpinnerMock,
      SPINNER_INTERVAL_MS: 80,
    }));

    const { runAgentsParallel } = await import("../src/agent.js");

    const tasks = [
      { prompt: "prompt1", label: "Agent A" },
      { prompt: "prompt2", label: "Agent B" },
      { prompt: "prompt3", label: "Agent C" },
    ];

    const resultPromise = runAgentsParallel(
      tasks,
      AGENTS.claude,
      makeOptions(),
    );

    await vi.waitFor(() => {
      expect(spawnMock).toHaveBeenCalledTimes(3);
    });

    children[0].stdout.emit("data", Buffer.from("output A"));
    children[0].emit("close", 0);
    children[1].stdout.emit("data", Buffer.from("output B"));
    children[1].emit("close", 0);
    children[2].stdout.emit("data", Buffer.from("output C"));
    children[2].emit("close", 1);

    const results = await resultPromise;

    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({ output: "output A", exitCode: 0, label: "Agent A" });
    expect(results[1]).toEqual({ output: "output B", exitCode: 0, label: "Agent B" });
    expect(results[2]).toEqual({ output: "output C", exitCode: 1, label: "Agent C" });

    expect(MultiSpinnerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        labels: ["Agent A", "Agent B", "Agent C"],
        startTime: expect.any(Number),
      }),
    );
    expect(mockSpinner.start).toHaveBeenCalledOnce();
    expect(mockSpinner.succeed).toHaveBeenCalledWith(0);
    expect(mockSpinner.succeed).toHaveBeenCalledWith(1);
    expect(mockSpinner.fail).toHaveBeenCalledWith(2);
    expect(mockSpinner.stop).toHaveBeenCalledOnce();
  });

  it("treats exit 0 with empty output as failure", async () => {
    const children = [createMockChild(), createMockChild()];
    let childIdx = 0;
    spawnMock = vi.fn().mockImplementation(() => children[childIdx++]);

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

    const mockSpinner = { start: vi.fn(), succeed: vi.fn(), fail: vi.fn(), stop: vi.fn() };
    const MultiSpinnerMock = vi.fn().mockImplementation(() => mockSpinner);

    vi.doMock("../src/ui.js", () => ({
      isUtf8: false,
      dim: (s: string) => s,
      formatDuration: (s: number) => `${s}s`,
      printWarning: vi.fn(),
      MultiSpinner: MultiSpinnerMock,
      SPINNER_INTERVAL_MS: 80,
    }));

    const { runAgentsParallel } = await import("../src/agent.js");

    const tasks = [
      { prompt: "p1", label: "With Output" },
      { prompt: "p2", label: "Empty Output" },
    ];

    const resultPromise = runAgentsParallel(
      tasks, AGENTS.claude, makeOptions(),
    );

    await vi.waitFor(() => {
      expect(spawnMock).toHaveBeenCalledTimes(2);
    });

    children[0].stdout.emit("data", Buffer.from("some output"));
    children[0].emit("close", 0);
    children[1].emit("close", 0);

    const results = await resultPromise;

    expect(results[0]).toEqual({ output: "some output", exitCode: 0, label: "With Output" });
    expect(results[1]).toEqual({ output: "", exitCode: 0, label: "Empty Output" });

    expect(mockSpinner.succeed).toHaveBeenCalledWith(0);
    expect(mockSpinner.succeed).not.toHaveBeenCalledWith(1);
    expect(mockSpinner.fail).toHaveBeenCalledWith(1);
  });

  it("does not write individual agent outputs to stdout", async () => {
    const children = [createMockChild(), createMockChild()];
    let childIdx = 0;
    spawnMock = vi.fn().mockImplementation(() => children[childIdx++]);

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

    vi.doMock("../src/ui.js", () => ({
      isUtf8: false,
      dim: (s: string) => s,
      formatDuration: (s: number) => `${s}s`,
      printWarning: vi.fn(),
      MultiSpinner: vi.fn().mockImplementation(() => ({
        start: vi.fn(), succeed: vi.fn(), fail: vi.fn(), stop: vi.fn(),
      })),
      SPINNER_INTERVAL_MS: 80,
    }));

    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const { runAgentsParallel } = await import("../src/agent.js");

    const tasks = [
      { prompt: "p1", label: "A" },
      { prompt: "p2", label: "B" },
    ];

    const resultPromise = runAgentsParallel(
      tasks, AGENTS.claude, makeOptions(),
    );

    await vi.waitFor(() => {
      expect(spawnMock).toHaveBeenCalledTimes(2);
    });

    children[0].stdout.emit("data", Buffer.from("output A"));
    children[0].emit("close", 0);
    children[1].stdout.emit("data", Buffer.from("output B"));
    children[1].emit("close", 0);

    await resultPromise;

    const stdoutCalls = stdoutSpy.mock.calls.map(c => String(c[0]));
    expect(stdoutCalls.some(s => s.includes("output A"))).toBe(false);
    expect(stdoutCalls.some(s => s.includes("output B"))).toBe(false);

    stdoutSpy.mockRestore();
  });

  it("runs agents sequentially in debug mode", async () => {
    const children = [createMockChild(), createMockChild()];
    let childIdx = 0;
    spawnMock = vi.fn().mockImplementation(() => children[childIdx++]);

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

    vi.doMock("../src/ui.js", () => ({
      isUtf8: false,
      dim: (s: string) => s,
      formatDuration: (s: number) => `${s}s`,
      printWarning: vi.fn(),
      MultiSpinner: vi.fn().mockImplementation(() => ({
        start: vi.fn(), succeed: vi.fn(), fail: vi.fn(), stop: vi.fn(),
      })),
      SPINNER_INTERVAL_MS: 80,
    }));

    const { runAgentsParallel } = await import("../src/agent.js");

    const tasks = [
      { prompt: "p1", label: "First" },
      { prompt: "p2", label: "Second" },
    ];

    const resultPromise = runAgentsParallel(
      tasks, AGENTS.claude, makeOptions({ debug: true }),
    );

    await vi.waitFor(() => {
      expect(spawnMock).toHaveBeenCalledTimes(1);
    });

    children[0].stdout.emit("data", Buffer.from("first output"));
    children[0].emit("close", 0);

    await vi.waitFor(() => {
      expect(spawnMock).toHaveBeenCalledTimes(2);
    });

    children[1].stdout.emit("data", Buffer.from("second output"));
    children[1].emit("close", 0);

    const results = await resultPromise;
    expect(results).toHaveLength(2);
    expect(results[0].label).toBe("First");
    expect(results[1].label).toBe("Second");
  });
});
