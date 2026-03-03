import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { RalphOptions } from "../../src/agent.js";

const mocks = vi.hoisted(() => ({
  runAgent: vi.fn(),
  hasContent: vi.fn(),
  countTasks: vi.fn(),
  loadRefinePrompt: vi.fn(),
  printHeader: vi.fn(),
  printKv: vi.fn(),
  printPhase: vi.fn(),
  printTimingSummary: vi.fn(),
  printLimitReached: vi.fn(),
  printWorktreeNext: vi.fn(),
  printError: vi.fn(),
}));

vi.mock("../../src/agent.js", () => ({
  runAgent: mocks.runAgent,
}));

vi.mock("../../src/state.js", () => ({
  hasContent: mocks.hasContent,
  countTasks: mocks.countTasks,
}));

vi.mock("../../src/prompt.js", () => ({
  loadRefinePrompt: mocks.loadRefinePrompt,
}));

vi.mock("../../src/ui.js", () => ({
  dim: (s: string) => s,
  green: (s: string) => s,
  SYM_DOT: ".",
  SYM_CHECK: "done",
  line: () => "-".repeat(74),
  formatDuration: (s: number) => `${s}s`,
  secondsSince: (start: number) => Math.max(0, Math.floor((Date.now() - start) / 1000)),
  printHeader: mocks.printHeader,
  printKv: mocks.printKv,
  printPhase: mocks.printPhase,
  printTimingSummary: mocks.printTimingSummary,
  printLimitReached: mocks.printLimitReached,
  printWorktreeNext: mocks.printWorktreeNext,
  printError: mocks.printError,
}));

import { runRefine } from "../../src/commands/refine.js";

const defaultOptions: RalphOptions = {
  agent: "claude",
  debug: false,
  force: false,
  noCommit: false,
  noRefine: false,
  noReview: false,
  worktree: false,
  timeout: 0,
};

const agentConfig = { name: "claude", command: "claude", args: ["-p"] };

describe("runRefine", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    mocks.hasContent.mockResolvedValue(true);
    mocks.countTasks.mockResolvedValue(5);
    mocks.loadRefinePrompt.mockResolvedValue("refine prompt");
    mocks.printWorktreeNext.mockReturnValue(true);
    mocks.runAgent.mockResolvedValue({ output: "no signal", exitCode: 0 });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("returns early when no plan exists", async () => {
    mocks.hasContent.mockResolvedValue(false);

    const result = await runRefine(10, agentConfig, defaultOptions);
    expect(result).toEqual({ done: false, iterations: 0 });
    expect(mocks.printError).toHaveBeenCalledWith("no implementation plan found");
  });

  it("alternates phases between investigate and review", async () => {
    vi.useFakeTimers();

    mocks.runAgent.mockResolvedValue({ output: "working", exitCode: 0 });

    const promise = runRefine(3, agentConfig, defaultOptions);

    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(1000);
    }

    const result = await promise;
    expect(result).toEqual({ done: false, iterations: 3 });

    const phaseCalls = mocks.printPhase.mock.calls;
    expect(phaseCalls[0]).toEqual([1, "investigate", undefined, expect.any(Number)]);
    expect(phaseCalls[1]).toEqual([2, "review", undefined, expect.any(Number)]);
    expect(phaseCalls[2]).toEqual([3, "investigate", undefined, expect.any(Number)]);

    const promptCalls = mocks.loadRefinePrompt.mock.calls;
    expect(promptCalls[0][0]).toBe("investigate");
    expect(promptCalls[1][0]).toBe("review");
    expect(promptCalls[2][0]).toBe("investigate");
  });

  it("detects ready signal in agent output", async () => {
    vi.useFakeTimers();

    mocks.runAgent
      .mockResolvedValueOnce({ output: "analysis\n<signal>PLAN_READY</signal>\n", exitCode: 0 })
      .mockResolvedValueOnce({ output: "more work\n", exitCode: 0 })
      .mockResolvedValue({ output: "still working", exitCode: 0 });

    const promise = runRefine(5, agentConfig, defaultOptions);

    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(1000);
    }

    const result = await promise;
    expect(result).toEqual({ done: false, iterations: 5 });

    const logCalls = consoleSpy.mock.calls.map((c) => String(c[0]));
    const readyLog = logCalls.find((l) => l.includes("plan is ready (1/2)"));
    expect(readyLog).toBeDefined();
  });

  it("returns done after 2 consecutive ready signals", async () => {
    vi.useFakeTimers();

    mocks.runAgent
      .mockResolvedValueOnce({ output: "lines\n<signal>PLAN_READY</signal>\n", exitCode: 0 })
      .mockResolvedValueOnce({ output: "lines\n<signal>PLAN_READY</signal>\n", exitCode: 0 });

    const promise = runRefine(10, agentConfig, defaultOptions);

    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result).toEqual({ done: true, iterations: 2 });

    const logCalls = consoleSpy.mock.calls.map((c) => String(c[0]));
    const planReady = logCalls.find((l) => l.includes("plan ready"));
    expect(planReady).toBeDefined();
  });

  it("resets consecutive ready count when signal absent", async () => {
    vi.useFakeTimers();

    mocks.runAgent
      .mockResolvedValueOnce({ output: "<signal>PLAN_READY</signal>\n", exitCode: 0 })
      .mockResolvedValueOnce({ output: "no signal here\n", exitCode: 0 })
      .mockResolvedValueOnce({ output: "<signal>PLAN_READY</signal>\n", exitCode: 0 })
      .mockResolvedValue({ output: "no signal\n", exitCode: 0 });

    const promise = runRefine(5, agentConfig, defaultOptions);

    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(1000);
    }

    const result = await promise;
    expect(result).toEqual({ done: false, iterations: 5 });

    expect(mocks.printLimitReached).toHaveBeenCalledWith(5, "ralph", "refine", false, expect.any(Number));
  });

  it("respects max iterations", async () => {
    vi.useFakeTimers();

    mocks.runAgent.mockResolvedValue({ output: "working", exitCode: 0 });

    const promise = runRefine(2, agentConfig, defaultOptions);

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result).toEqual({ done: false, iterations: 2 });
    expect(mocks.printLimitReached).toHaveBeenCalledWith(2, "ralph", "refine", false, expect.any(Number));
  });

  it("prints worktree next steps on limit reached", async () => {
    vi.useFakeTimers();

    const worktreeInfo = { branch: "ralph/refine-20260224", name: "repo-ralph-120000", dir: "/tmp/repo-ralph-120000" };

    mocks.runAgent.mockResolvedValue({ output: "working", exitCode: 0 });

    const promise = runRefine(1, agentConfig, defaultOptions, worktreeInfo);

    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result).toEqual({ done: false, iterations: 1 });
    expect(mocks.printWorktreeNext).toHaveBeenCalledWith("resume", worktreeInfo, "ralph", "refine");
  });

  it("skips ready detection when agent fails and continues", async () => {
    vi.useFakeTimers();

    mocks.runAgent
      .mockResolvedValueOnce({ output: "", exitCode: 1 })
      .mockResolvedValueOnce({ output: "lines\n<signal>PLAN_READY</signal>\n", exitCode: 0 })
      .mockResolvedValueOnce({ output: "lines\n<signal>PLAN_READY</signal>\n", exitCode: 0 });

    const promise = runRefine(10, agentConfig, defaultOptions);

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result).toEqual({ done: true, iterations: 3 });
    expect(mocks.runAgent).toHaveBeenCalledTimes(3);
  });

  it("resets consecutive ready count on agent failure", async () => {
    vi.useFakeTimers();

    mocks.runAgent
      .mockResolvedValueOnce({ output: "<signal>PLAN_READY</signal>\n", exitCode: 0 })
      .mockResolvedValueOnce({ output: "", exitCode: 1 })
      .mockResolvedValueOnce({ output: "<signal>PLAN_READY</signal>\n", exitCode: 0 })
      .mockResolvedValueOnce({ output: "<signal>PLAN_READY</signal>\n", exitCode: 0 });

    const promise = runRefine(10, agentConfig, defaultOptions);

    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(1000);
    }

    const result = await promise;
    expect(result).toEqual({ done: true, iterations: 4 });
    expect(mocks.runAgent).toHaveBeenCalledTimes(4);
  });

  it("resets consecutive failure count after a successful iteration", async () => {
    vi.useFakeTimers();

    mocks.runAgent
      .mockResolvedValueOnce({ output: "", exitCode: 1 })
      .mockResolvedValueOnce({ output: "ok", exitCode: 0 })
      .mockResolvedValueOnce({ output: "", exitCode: 1 })
      .mockResolvedValueOnce({ output: "ok", exitCode: 0 })
      .mockResolvedValueOnce({ output: "", exitCode: 1 });

    const promise = runRefine(5, agentConfig, defaultOptions);

    for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result).toEqual({ done: false, iterations: 5 });

    expect(mocks.printError).not.toHaveBeenCalledWith(
      "agent failed 3 times consecutively; stopping",
    );
  });

  it("stops after 3 consecutive agent failures", async () => {
    vi.useFakeTimers();

    mocks.runAgent.mockResolvedValue({ output: "", exitCode: 1 });

    const promise = runRefine(10, agentConfig, defaultOptions);

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result).toEqual({ done: false, iterations: 3 });

    expect(mocks.runAgent).toHaveBeenCalledTimes(3);
    expect(mocks.printError).toHaveBeenCalledWith("agent failed 3 times consecutively; stopping");
  });
});
