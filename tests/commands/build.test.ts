import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { RalphOptions } from "../../src/agent.js";

const mocks = vi.hoisted(() => ({
  runAgent: vi.fn(),
  hasContent: vi.fn(),
  countTasks: vi.fn(),
  getHeadHash: vi.fn(),
  buildBuildPrompt: vi.fn(),
  buildReviewPrompt: vi.fn(),
  buildFinalReviewPrompt: vi.fn(),
  printHeader: vi.fn(),
  printKv: vi.fn(),
  printPhase: vi.fn(),
  printComplete: vi.fn(),
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

vi.mock("../../src/git.js", () => ({
  getHeadHash: mocks.getHeadHash,
}));

vi.mock("../../src/prompt.js", () => ({
  buildBuildPrompt: mocks.buildBuildPrompt,
  buildReviewPrompt: mocks.buildReviewPrompt,
  buildFinalReviewPrompt: mocks.buildFinalReviewPrompt,
}));

vi.mock("../../src/ui.js", () => ({
  dim: (s: string) => s,
  green: (s: string) => s,
  SYM_CHECK: "done",
  line: () => "-".repeat(74),
  formatDuration: (s: number) => `${s}s`,
  printHeader: mocks.printHeader,
  printKv: mocks.printKv,
  printPhase: mocks.printPhase,
  printComplete: mocks.printComplete,
  printLimitReached: mocks.printLimitReached,
  printWorktreeNext: mocks.printWorktreeNext,
  printError: mocks.printError,
}));

import { runBuild } from "../../src/commands/build.js";

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

describe("runBuild", () => {
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
    mocks.countTasks.mockResolvedValue(3);
    mocks.getHeadHash.mockResolvedValue("abc123");
    mocks.buildBuildPrompt.mockResolvedValue("build prompt");
    mocks.buildReviewPrompt.mockResolvedValue("review prompt");
    mocks.buildFinalReviewPrompt.mockResolvedValue("final review prompt");
    mocks.runAgent.mockResolvedValue({ output: "done", exitCode: 0 });
    mocks.printWorktreeNext.mockReturnValue(true);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("errors when no plan exists", async () => {
    mocks.hasContent.mockResolvedValue(false);

    await expect(runBuild(10, agentConfig, defaultOptions)).rejects.toThrow("EXIT");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mocks.printError).toHaveBeenCalledWith("no implementation plan found");
  });

  it("exits when 0 tasks at start", async () => {
    mocks.countTasks.mockResolvedValue(0);

    await expect(runBuild(10, agentConfig, defaultOptions)).rejects.toThrow("EXIT");
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("runs build and review per iteration", async () => {
    vi.useFakeTimers();

    mocks.countTasks.mockResolvedValue(2);

    const promise = runBuild(1, agentConfig, defaultOptions);
    promise.catch(() => {});

    await vi.advanceTimersByTimeAsync(1000);

    await expect(promise).rejects.toThrow("EXIT");

    expect(mocks.buildBuildPrompt).toHaveBeenCalledWith(false, false);
    expect(mocks.buildReviewPrompt).toHaveBeenCalledWith(false);
    expect(mocks.runAgent).toHaveBeenCalledTimes(2);

    expect(mocks.printPhase).toHaveBeenCalledWith(1, "build", "2 tasks remaining");
    expect(mocks.printPhase).toHaveBeenCalledWith(1, "review");
  });

  it("skips review with --no-review", async () => {
    vi.useFakeTimers();

    mocks.countTasks.mockResolvedValue(2);
    const opts = { ...defaultOptions, noReview: true };

    const promise = runBuild(1, agentConfig, opts);
    promise.catch(() => {});

    await vi.advanceTimersByTimeAsync(1000);

    await expect(promise).rejects.toThrow("EXIT");

    expect(mocks.buildBuildPrompt).toHaveBeenCalledWith(true, false);
    expect(mocks.buildReviewPrompt).not.toHaveBeenCalled();
    expect(mocks.runAgent).toHaveBeenCalledTimes(1);
  });

  it("passes noCommit flag to prompt builders", async () => {
    vi.useFakeTimers();

    mocks.countTasks.mockResolvedValue(2);
    const opts = { ...defaultOptions, noCommit: true };

    const promise = runBuild(1, agentConfig, opts);
    promise.catch(() => {});

    await vi.advanceTimersByTimeAsync(1000);

    await expect(promise).rejects.toThrow("EXIT");

    expect(mocks.buildBuildPrompt).toHaveBeenCalledWith(false, true);
    expect(mocks.buildReviewPrompt).toHaveBeenCalledWith(true);
  });

  it("runs final review when tasks reach 0", async () => {
    vi.useFakeTimers();

    let taskCallCount = 0;
    mocks.countTasks.mockImplementation(async () => {
      taskCallCount++;
      if (taskCallCount <= 1) return 1;
      return 0;
    });

    const promise = runBuild(10, agentConfig, defaultOptions);
    promise.catch(() => {});

    await vi.advanceTimersByTimeAsync(1000);

    await expect(promise).rejects.toThrow("EXIT");
    expect(exitSpy).toHaveBeenCalledWith(0);

    expect(mocks.buildFinalReviewPrompt).toHaveBeenCalledWith("abc123", false);
    expect(mocks.printComplete).toHaveBeenCalled();
  });

  it("skips final review with --no-review when tasks reach 0", async () => {
    vi.useFakeTimers();

    let taskCallCount = 0;
    mocks.countTasks.mockImplementation(async () => {
      taskCallCount++;
      if (taskCallCount <= 1) return 1;
      return 0;
    });

    const opts = { ...defaultOptions, noReview: true };
    const promise = runBuild(10, agentConfig, opts);
    promise.catch(() => {});

    await vi.advanceTimersByTimeAsync(1000);

    await expect(promise).rejects.toThrow("EXIT");
    expect(mocks.buildFinalReviewPrompt).not.toHaveBeenCalled();
    expect(mocks.printComplete).toHaveBeenCalled();
  });

  it("exits at max iterations", async () => {
    vi.useFakeTimers();

    mocks.countTasks.mockResolvedValue(5);

    const promise = runBuild(2, agentConfig, defaultOptions);
    promise.catch(() => {});

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    await expect(promise).rejects.toThrow("EXIT");
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(mocks.printLimitReached).toHaveBeenCalledWith(2, "ralph", "build", false);
  });

  it("prints worktree next steps on completion", async () => {
    vi.useFakeTimers();

    let taskCallCount = 0;
    mocks.countTasks.mockImplementation(async () => {
      taskCallCount++;
      if (taskCallCount <= 1) return 1;
      return 0;
    });

    const worktreeInfo = { branch: "ralph/build-20260224", name: "repo-ralph-120000", dir: "/tmp/repo-ralph-120000" };

    const promise = runBuild(10, agentConfig, defaultOptions, worktreeInfo);
    promise.catch(() => {});

    await vi.advanceTimersByTimeAsync(1000);

    await expect(promise).rejects.toThrow("EXIT");
    expect(mocks.printWorktreeNext).toHaveBeenCalledWith("merge", worktreeInfo, "ralph", "build");
  });

  it("prints header and config info", async () => {
    mocks.countTasks.mockResolvedValue(0);

    await expect(runBuild(10, agentConfig, defaultOptions)).rejects.toThrow("EXIT");

    expect(mocks.printHeader).toHaveBeenCalledWith("building");
    expect(mocks.printKv).toHaveBeenCalledWith("agent", "claude");
    expect(mocks.printKv).toHaveBeenCalledWith("tasks", "0 remaining");
    expect(mocks.printKv).toHaveBeenCalledWith("limit", "10 iterations");
  });

  it("shows review/commit flags in header", async () => {
    mocks.countTasks.mockResolvedValue(0);
    const opts = { ...defaultOptions, noReview: true, noCommit: true };

    await expect(runBuild(10, agentConfig, opts)).rejects.toThrow("EXIT");

    expect(mocks.printKv).toHaveBeenCalledWith("review", "off");
    expect(mocks.printKv).toHaveBeenCalledWith("commit", "off");
  });

  it("skips review when agent fails and continues to next iteration", async () => {
    vi.useFakeTimers();

    mocks.countTasks.mockResolvedValue(2);
    mocks.runAgent
      .mockResolvedValueOnce({ output: "", exitCode: 1 })
      .mockResolvedValueOnce({ output: "done", exitCode: 0 });

    const promise = runBuild(2, agentConfig, defaultOptions);
    promise.catch(() => {});

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    await expect(promise).rejects.toThrow("EXIT");

    expect(mocks.runAgent).toHaveBeenCalledTimes(3);
    expect(mocks.buildReviewPrompt).toHaveBeenCalledTimes(1);
  });

  it("resets consecutive failure count after a successful iteration", async () => {
    vi.useFakeTimers();

    mocks.countTasks.mockResolvedValue(2);
    const opts = { ...defaultOptions, noReview: true };

    mocks.runAgent
      .mockResolvedValueOnce({ output: "", exitCode: 1 })
      .mockResolvedValueOnce({ output: "ok", exitCode: 0 })
      .mockResolvedValueOnce({ output: "", exitCode: 1 })
      .mockResolvedValueOnce({ output: "ok", exitCode: 0 })
      .mockResolvedValueOnce({ output: "", exitCode: 1 });

    const promise = runBuild(5, agentConfig, opts);
    promise.catch(() => {});

    for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(1000);

    await expect(promise).rejects.toThrow("EXIT");

    expect(mocks.printError).not.toHaveBeenCalledWith(
      "agent failed 3 times consecutively; stopping",
    );
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("exits after 3 consecutive agent failures", async () => {
    vi.useFakeTimers();

    mocks.countTasks.mockResolvedValue(2);
    mocks.runAgent.mockResolvedValue({ output: "", exitCode: 1 });

    const promise = runBuild(10, agentConfig, defaultOptions);
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
