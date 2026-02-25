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
  printHeader: mocks.printHeader,
  printKv: mocks.printKv,
  printPhase: mocks.printPhase,
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
  noReview: false,
  worktree: false,
  timeout: 0,
};

const agentConfig = { name: "claude", command: "claude", args: ["-p"] };

describe("runRefine", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("EXIT");
    }) as never);
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

  it("errors when no plan exists", async () => {
    mocks.hasContent.mockResolvedValue(false);

    await expect(runRefine(10, agentConfig, defaultOptions)).rejects.toThrow("EXIT");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mocks.printError).toHaveBeenCalledWith("no implementation plan found");
  });

  it("alternates phases between investigate and review", async () => {
    vi.useFakeTimers();

    mocks.runAgent.mockResolvedValue({ output: "working", exitCode: 0 });

    const promise = runRefine(3, agentConfig, defaultOptions);
    promise.catch(() => {});

    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(1000);
    }

    await expect(promise).rejects.toThrow("EXIT");

    const phaseCalls = mocks.printPhase.mock.calls;
    expect(phaseCalls[0]).toEqual([1, "investigate"]);
    expect(phaseCalls[1]).toEqual([2, "review"]);
    expect(phaseCalls[2]).toEqual([3, "investigate"]);

    const promptCalls = mocks.loadRefinePrompt.mock.calls;
    expect(promptCalls[0][0]).toBe("investigate");
    expect(promptCalls[1][0]).toBe("review");
    expect(promptCalls[2][0]).toBe("investigate");
  });

  it("detects ready signal in agent output", async () => {
    vi.useFakeTimers();

    mocks.runAgent
      .mockResolvedValueOnce({ output: "analysis\n<done>PLAN_READY</done>\n", exitCode: 0 })
      .mockResolvedValueOnce({ output: "more work\n", exitCode: 0 })
      .mockResolvedValue({ output: "still working", exitCode: 0 });

    const promise = runRefine(5, agentConfig, defaultOptions);
    promise.catch(() => {});

    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(1000);
    }

    await expect(promise).rejects.toThrow("EXIT");

    const logCalls = consoleSpy.mock.calls.map((c) => c[0]);
    const readyLog = logCalls.find((l: string) => typeof l === "string" && l.includes("plan is ready (1/2)"));
    expect(readyLog).toBeDefined();
  });

  it("exits after 2 consecutive ready signals", async () => {
    vi.useFakeTimers();

    mocks.runAgent
      .mockResolvedValueOnce({ output: "lines\n<done>PLAN_READY</done>\n", exitCode: 0 })
      .mockResolvedValueOnce({ output: "lines\n<done>PLAN_READY</done>\n", exitCode: 0 });

    const promise = runRefine(10, agentConfig, defaultOptions);
    promise.catch(() => {});

    await vi.advanceTimersByTimeAsync(1000);

    await expect(promise).rejects.toThrow("EXIT");
    expect(exitSpy).toHaveBeenCalledWith(0);

    const logCalls = consoleSpy.mock.calls.map((c) => c[0]);
    const planReady = logCalls.find((l: string) => typeof l === "string" && l.includes("plan ready"));
    expect(planReady).toBeDefined();
  });

  it("resets consecutive ready count when signal absent", async () => {
    vi.useFakeTimers();

    mocks.runAgent
      .mockResolvedValueOnce({ output: "<done>PLAN_READY</done>\n", exitCode: 0 })
      .mockResolvedValueOnce({ output: "no signal here\n", exitCode: 0 })
      .mockResolvedValueOnce({ output: "<done>PLAN_READY</done>\n", exitCode: 0 })
      .mockResolvedValue({ output: "no signal\n", exitCode: 0 });

    const promise = runRefine(5, agentConfig, defaultOptions);
    promise.catch(() => {});

    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(1000);
    }

    await expect(promise).rejects.toThrow("EXIT");

    expect(mocks.printLimitReached).toHaveBeenCalledWith(5, "ralph", "refine", false);
  });

  it("respects max iterations", async () => {
    vi.useFakeTimers();

    mocks.runAgent.mockResolvedValue({ output: "working", exitCode: 0 });

    const promise = runRefine(2, agentConfig, defaultOptions);
    promise.catch(() => {});

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    await expect(promise).rejects.toThrow("EXIT");
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(mocks.printLimitReached).toHaveBeenCalledWith(2, "ralph", "refine", false);
  });

  it("prints worktree next steps on limit reached", async () => {
    vi.useFakeTimers();

    const worktreeInfo = { branch: "ralph/refine-20260224", name: "repo-ralph-120000", dir: "/tmp/repo-ralph-120000" };

    mocks.runAgent.mockResolvedValue({ output: "working", exitCode: 0 });

    const promise = runRefine(1, agentConfig, defaultOptions, worktreeInfo);
    promise.catch(() => {});

    await vi.advanceTimersByTimeAsync(1000);

    await expect(promise).rejects.toThrow("EXIT");
    expect(mocks.printWorktreeNext).toHaveBeenCalledWith("resume", worktreeInfo, "ralph", "refine");
  });

  it("skips ready detection when agent fails and continues", async () => {
    vi.useFakeTimers();

    mocks.runAgent
      .mockResolvedValueOnce({ output: "", exitCode: 1 })
      .mockResolvedValueOnce({ output: "lines\n<done>PLAN_READY</done>\n", exitCode: 0 })
      .mockResolvedValueOnce({ output: "lines\n<done>PLAN_READY</done>\n", exitCode: 0 });

    const promise = runRefine(10, agentConfig, defaultOptions);
    promise.catch(() => {});

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    await expect(promise).rejects.toThrow("EXIT");
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(mocks.runAgent).toHaveBeenCalledTimes(3);
  });

  it("exits after 3 consecutive agent failures", async () => {
    vi.useFakeTimers();

    mocks.runAgent.mockResolvedValue({ output: "", exitCode: 1 });

    const promise = runRefine(10, agentConfig, defaultOptions);
    promise.catch(() => {});

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    await expect(promise).rejects.toThrow("EXIT");

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mocks.runAgent).toHaveBeenCalledTimes(3);
    expect(mocks.printError).toHaveBeenCalledWith("agent failed 3 times consecutively; stopping");
  });
});
