import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { RalphOptions } from "../../src/agent.js";

const mocks = vi.hoisted(() => ({
  runAgent: vi.fn(),
  hasContent: vi.fn(),
  countTasks: vi.fn(),
  saveReview: vi.fn(),
  getHeadHash: vi.fn(),
  getCurrentBranch: vi.fn(),
  getDiffStat: vi.fn(),
  getCommitLog: vi.fn(),
  buildBuildPrompt: vi.fn(),
  buildReviewPrompt: vi.fn(),
  buildFixPrompt: vi.fn(),
  runReviewPipeline: vi.fn(),
  printHeader: vi.fn(),
  printKv: vi.fn(),
  printPhase: vi.fn(),
  printComplete: vi.fn(),
  printLimitReached: vi.fn(),
  printWorktreeNext: vi.fn(),
  printError: vi.fn(),
  printWarning: vi.fn(),
}));

vi.mock("../../src/agent.js", () => ({
  runAgent: mocks.runAgent,
}));

vi.mock("../../src/state.js", () => ({
  hasContent: mocks.hasContent,
  countTasks: mocks.countTasks,
  saveReview: mocks.saveReview,
}));

vi.mock("../../src/git.js", () => ({
  getHeadHash: mocks.getHeadHash,
  getCurrentBranch: mocks.getCurrentBranch,
  getDiffStat: mocks.getDiffStat,
  getCommitLog: mocks.getCommitLog,
}));

vi.mock("../../src/prompt.js", () => ({
  buildBuildPrompt: mocks.buildBuildPrompt,
  buildReviewPrompt: mocks.buildReviewPrompt,
  buildFixPrompt: mocks.buildFixPrompt,
}));

vi.mock("../../src/commands/review.js", () => ({
  runReviewPipeline: mocks.runReviewPipeline,
}));

vi.mock("../../src/ui.js", () => ({
  dim: (s: string) => s,
  green: (s: string) => s,
  SYM_CHECK: "done",
  line: () => "-".repeat(74),
  formatDuration: (s: number) => `${s}s`,
  secondsSince: (start: number) => Math.max(0, Math.floor((Date.now() - start) / 1000)),
  printHeader: mocks.printHeader,
  printKv: mocks.printKv,
  printPhase: mocks.printPhase,
  printComplete: mocks.printComplete,
  printLimitReached: mocks.printLimitReached,
  printWorktreeNext: mocks.printWorktreeNext,
  printError: mocks.printError,
  printWarning: mocks.printWarning,
}));

import { runBuild, isSuccessStatus } from "../../src/commands/build.js";

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

describe("runBuild", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    mocks.hasContent.mockResolvedValue(true);
    mocks.countTasks.mockResolvedValue(3);
    mocks.getHeadHash.mockResolvedValue("abc123");
    mocks.getCurrentBranch.mockResolvedValue("test-branch");
    mocks.getDiffStat.mockResolvedValue("stat");
    mocks.getCommitLog.mockResolvedValue("log");
    mocks.saveReview.mockResolvedValue(undefined);
    mocks.buildBuildPrompt.mockResolvedValue("build prompt");
    mocks.buildReviewPrompt.mockResolvedValue("review prompt");
    mocks.buildFixPrompt.mockResolvedValue("fix prompt");
    mocks.runAgent.mockResolvedValue({ output: "done", exitCode: 0 });
    mocks.runReviewPipeline.mockResolvedValue({ reviewContent: "review output", needsRevision: false, fallback: false });
    mocks.printWorktreeNext.mockReturnValue(true);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("errors when no plan exists", async () => {
    mocks.hasContent.mockResolvedValue(false);

    const result = await runBuild(10, agentConfig, defaultOptions);
    expect(result).toEqual({ status: "no_plan", iterations: 0 });
    expect(mocks.printError).toHaveBeenCalledWith("no implementation plan found");
  });

  it("exits when 0 tasks at start", async () => {
    mocks.countTasks.mockResolvedValue(0);

    const result = await runBuild(10, agentConfig, defaultOptions);
    expect(result).toEqual({ status: "no_tasks", iterations: 0 });
  });

  it("runs build and review per iteration", async () => {
    vi.useFakeTimers();

    mocks.countTasks.mockResolvedValue(2);

    const promise = runBuild(1, agentConfig, defaultOptions);

    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result).toEqual({ status: "limit_reached", iterations: 1 });

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

    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result).toEqual({ status: "limit_reached", iterations: 1 });

    expect(mocks.buildBuildPrompt).toHaveBeenCalledWith(true, false);
    expect(mocks.buildReviewPrompt).not.toHaveBeenCalled();
    expect(mocks.runAgent).toHaveBeenCalledTimes(1);
  });

  it("passes noCommit flag to prompt builders", async () => {
    vi.useFakeTimers();

    mocks.countTasks.mockResolvedValue(2);
    const opts = { ...defaultOptions, noCommit: true };

    const promise = runBuild(1, agentConfig, opts);

    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result).toEqual({ status: "limit_reached", iterations: 1 });

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

    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result).toEqual({ status: "completed", iterations: 1 });

    expect(mocks.runReviewPipeline).toHaveBeenCalledWith(
      expect.objectContaining({ diffCmd: "git diff abc123..HEAD" }),
      agentConfig,
      defaultOptions,
      expect.any(Number),
    );
    expect(mocks.saveReview).toHaveBeenCalledWith("review output");
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

    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result).toEqual({ status: "completed", iterations: 1 });
    expect(mocks.runReviewPipeline).not.toHaveBeenCalled();
    expect(mocks.printComplete).toHaveBeenCalled();
  });

  it("runs fix agent when needsRevision is true", async () => {
    vi.useFakeTimers();

    let taskCallCount = 0;
    mocks.countTasks.mockImplementation(async () => {
      taskCallCount++;
      if (taskCallCount <= 1) return 1;
      return 0;
    });

    mocks.runReviewPipeline.mockResolvedValue({
      reviewContent: "NEEDS REVISION found",
      needsRevision: true,
      fallback: false,
    });

    const promise = runBuild(10, agentConfig, defaultOptions);

    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result).toEqual({ status: "completed", iterations: 1 });

    expect(mocks.buildFixPrompt).toHaveBeenCalledWith("NEEDS REVISION found", undefined, false);
    expect(mocks.runAgent).toHaveBeenCalledWith("fix prompt", agentConfig, defaultOptions, "fixing", undefined, expect.any(Number));
    expect(mocks.printPhase).toHaveBeenCalledWith(1, "fix");
  });

  it("does not run fix agent when needsRevision is false", async () => {
    vi.useFakeTimers();

    let taskCallCount = 0;
    mocks.countTasks.mockImplementation(async () => {
      taskCallCount++;
      if (taskCallCount <= 1) return 1;
      return 0;
    });

    mocks.runReviewPipeline.mockResolvedValue({
      reviewContent: "APPROVED - all good",
      needsRevision: false,
      fallback: false,
    });

    const promise = runBuild(10, agentConfig, defaultOptions);

    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result).toEqual({ status: "completed", iterations: 1 });

    expect(mocks.buildFixPrompt).not.toHaveBeenCalled();
    expect(mocks.printPhase).not.toHaveBeenCalledWith(expect.anything(), "fix");
  });

  it("uses plain diff range in --no-commit mode", async () => {
    vi.useFakeTimers();

    let taskCallCount = 0;
    mocks.countTasks.mockImplementation(async () => {
      taskCallCount++;
      if (taskCallCount <= 1) return 1;
      return 0;
    });

    const opts = { ...defaultOptions, noCommit: true };
    const promise = runBuild(10, agentConfig, opts);

    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result).toEqual({ status: "completed", iterations: 1 });

    expect(mocks.runReviewPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        diffCmd: "git diff abc123",
        commitLog: "",
      }),
      agentConfig,
      opts,
      expect.any(Number),
    );
  });

  it("exits at max iterations", async () => {
    vi.useFakeTimers();

    mocks.countTasks.mockResolvedValue(5);

    const promise = runBuild(2, agentConfig, defaultOptions);

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result).toEqual({ status: "limit_reached", iterations: 2 });
    expect(mocks.printLimitReached).toHaveBeenCalledWith(2, "ralph", "build", false, expect.any(Number));
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

    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result).toEqual({ status: "completed", iterations: 1 });
    expect(mocks.printWorktreeNext).toHaveBeenCalledWith("merge", worktreeInfo, "ralph", "build");
  });

  it("prints header and config info", async () => {
    mocks.countTasks.mockResolvedValue(0);

    const result = await runBuild(10, agentConfig, defaultOptions);
    expect(result).toEqual({ status: "no_tasks", iterations: 0 });

    expect(mocks.printHeader).toHaveBeenCalledWith("building");
    expect(mocks.printKv).toHaveBeenCalledWith("agent", "claude");
    expect(mocks.printKv).toHaveBeenCalledWith("tasks", "0 remaining");
    expect(mocks.printKv).toHaveBeenCalledWith("limit", "10 iterations");
  });

  it("shows review/commit flags in header", async () => {
    mocks.countTasks.mockResolvedValue(0);
    const opts = { ...defaultOptions, noReview: true, noCommit: true };

    const result = await runBuild(10, agentConfig, opts);
    expect(result).toEqual({ status: "no_tasks", iterations: 0 });

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

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result).toEqual({ status: "limit_reached", iterations: 2 });

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

    for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result).toEqual({ status: "limit_reached", iterations: 5 });

    expect(mocks.printError).not.toHaveBeenCalledWith(
      "agent failed 3 times consecutively; stopping",
    );
  });

  it("exits when getHeadHash returns empty string", async () => {
    mocks.getHeadHash.mockResolvedValue("");

    const result = await runBuild(10, agentConfig, defaultOptions);
    expect(result).toEqual({ status: "no_head", iterations: 0 });
    expect(mocks.printError).toHaveBeenCalledWith("unable to resolve HEAD — is this a valid git repository?");
  });

  it("warns and completes when all reviewers fail during final review", async () => {
    vi.useFakeTimers();

    let taskCallCount = 0;
    mocks.countTasks.mockImplementation(async () => {
      taskCallCount++;
      if (taskCallCount <= 1) return 1;
      return 0;
    });

    mocks.runReviewPipeline.mockResolvedValue({
      reviewContent: undefined,
      needsRevision: false,
      fallback: false,
    });

    const promise = runBuild(10, agentConfig, defaultOptions);

    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result).toEqual({ status: "completed", iterations: 1 });

    expect(mocks.printWarning).toHaveBeenCalledWith("all reviewers failed — skipping review");
    expect(mocks.saveReview).not.toHaveBeenCalled();
    expect(mocks.buildFixPrompt).not.toHaveBeenCalled();
    expect(mocks.printComplete).toHaveBeenCalled();
  });

  it("exits after 3 consecutive agent failures", async () => {
    vi.useFakeTimers();

    mocks.countTasks.mockResolvedValue(2);
    mocks.runAgent.mockResolvedValue({ output: "", exitCode: 1 });

    const promise = runBuild(10, agentConfig, defaultOptions);

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result).toEqual({ status: "agent_failed", iterations: 3 });

    expect(mocks.runAgent).toHaveBeenCalledTimes(3);
    expect(mocks.printError).toHaveBeenCalledWith("agent failed 3 times consecutively; stopping");
  });
});

describe("isSuccessStatus", () => {
  it("returns true for completed", () => {
    expect(isSuccessStatus("completed")).toBe(true);
  });

  it("returns true for limit_reached", () => {
    expect(isSuccessStatus("limit_reached")).toBe(true);
  });

  it("returns true for no_tasks", () => {
    expect(isSuccessStatus("no_tasks")).toBe(true);
  });

  it("returns false for no_plan", () => {
    expect(isSuccessStatus("no_plan")).toBe(false);
  });

  it("returns false for no_head", () => {
    expect(isSuccessStatus("no_head")).toBe(false);
  });

  it("returns false for agent_failed", () => {
    expect(isSuccessStatus("agent_failed")).toBe(false);
  });
});
