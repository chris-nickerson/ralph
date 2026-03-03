import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { RalphOptions } from "../../src/agent.js";

const mocks = vi.hoisted(() => ({
  runAgent: vi.fn(),
  runAgentsParallel: vi.fn(),
  resolveReviewTarget: vi.fn(),
  isDiffEmpty: vi.fn(),
  getCurrentBranch: vi.fn(),
  getDiffStat: vi.fn(),
  getCommitLog: vi.fn(),
  buildSpecialistPrompt: vi.fn(),
  buildSynthesisPrompt: vi.fn(),
  buildVerificationPrompt: vi.fn(),
  saveReview: vi.fn(),
  printHeader: vi.fn(),
  printKv: vi.fn(),
  printStep: vi.fn(),
  printTimingSummary: vi.fn(),
  printError: vi.fn(),
  printWarning: vi.fn(),
}));

vi.mock("../../src/agent.js", () => ({
  runAgent: mocks.runAgent,
  runAgentsParallel: mocks.runAgentsParallel,
}));

vi.mock("../../src/git.js", () => ({
  resolveReviewTarget: mocks.resolveReviewTarget,
  isDiffEmpty: mocks.isDiffEmpty,
  getCurrentBranch: mocks.getCurrentBranch,
  getDiffStat: mocks.getDiffStat,
  getCommitLog: mocks.getCommitLog,
}));

vi.mock("../../src/prompt.js", () => ({
  buildSpecialistPrompt: mocks.buildSpecialistPrompt,
  buildSynthesisPrompt: mocks.buildSynthesisPrompt,
  buildVerificationPrompt: mocks.buildVerificationPrompt,
}));

vi.mock("../../src/state.js", () => ({
  saveReview: mocks.saveReview,
}));

vi.mock("../../src/ui.js", () => ({
  dim: (s: string) => s,
  formatDuration: (s: number) => `${s}s`,
  printHeader: mocks.printHeader,
  printKv: mocks.printKv,
  printStep: mocks.printStep,
  printTimingSummary: mocks.printTimingSummary,
  printError: mocks.printError,
  printWarning: mocks.printWarning,
}));

import { runReview, runReviewPipeline } from "../../src/commands/review.js";
import type { CodeReviewContext } from "../../src/prompt.js";

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

function setupDefaults() {
  mocks.resolveReviewTarget.mockResolvedValue({
    diffCmd: "git diff origin/main...HEAD",
    scope: "branch",
    range: "origin/main...HEAD",
    description: "auto-detected",
  });
  mocks.isDiffEmpty.mockResolvedValue(false);
  mocks.getCurrentBranch.mockResolvedValue("feature-branch");
  mocks.getDiffStat.mockResolvedValue(" src/foo.ts | 10 ++++\n 1 file changed");
  mocks.getCommitLog.mockResolvedValue("abc123 some commit");
  mocks.buildSpecialistPrompt.mockResolvedValue("specialist prompt");
  mocks.buildSynthesisPrompt.mockResolvedValue("synthesis prompt");
  mocks.buildVerificationPrompt.mockResolvedValue("verification prompt");

  mocks.runAgentsParallel.mockResolvedValue([
    { output: "review 1", exitCode: 0, label: "Correctness" },
    { output: "review 2", exitCode: 0, label: "Code Quality" },
    { output: "review 3", exitCode: 0, label: "Test Quality" },
    { output: "review 4", exitCode: 0, label: "Security & Perf" },
  ]);

  mocks.runAgent
    .mockResolvedValueOnce({ output: "synthesized review", exitCode: 0 })
    .mockResolvedValueOnce({ output: "final report\n<signal>APPROVED</signal>", exitCode: 0 });

  mocks.saveReview.mockResolvedValue(undefined);
}

describe("runReview", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    setupDefaults();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  it("returns empty_diff when diff is empty", async () => {
    mocks.isDiffEmpty.mockResolvedValue(true);

    const result = await runReview(agentConfig, defaultOptions);
    expect(result).toEqual({ status: "empty_diff" });
    expect(mocks.printError).toHaveBeenCalledWith("no changes to review");
  });

  it("forwards target to resolveReviewTarget", async () => {
    await runReview(agentConfig, defaultOptions, { type: "staged" });
    expect(mocks.resolveReviewTarget).toHaveBeenCalledWith({ type: "staged" });
  });

  it("runs all 3 phases in order and returns completed", async () => {
    const result = await runReview(agentConfig, defaultOptions);

    expect(result).toEqual({ status: "completed" });
    expect(mocks.printStep).toHaveBeenCalledWith(1, "specialists", "4 parallel reviews", expect.any(String));
    expect(mocks.runAgentsParallel).toHaveBeenCalledTimes(1);

    expect(mocks.printStep).toHaveBeenCalledWith(2, "synthesis", undefined, expect.any(String));
    expect(mocks.printStep).toHaveBeenCalledWith(3, "verification", undefined, expect.any(String));
    expect(mocks.runAgent).toHaveBeenCalledTimes(2);
  });

  it("builds 4 specialist prompts with correct indices", async () => {
    await runReview(agentConfig, defaultOptions);

    expect(mocks.buildSpecialistPrompt).toHaveBeenCalledTimes(4);
    expect(mocks.buildSpecialistPrompt).toHaveBeenCalledWith(1, expect.any(Object));
    expect(mocks.buildSpecialistPrompt).toHaveBeenCalledWith(2, expect.any(Object));
    expect(mocks.buildSpecialistPrompt).toHaveBeenCalledWith(3, expect.any(Object));
    expect(mocks.buildSpecialistPrompt).toHaveBeenCalledWith(4, expect.any(Object));
  });

  it("passes silent=true for synthesis agent", async () => {
    await runReview(agentConfig, defaultOptions);

    const synthCall = mocks.runAgent.mock.calls[0];
    expect(synthCall[0]).toBe("synthesis prompt");
    expect(synthCall[4]).toBe(true);
  });

  it("does not pass silent for verification agent", async () => {
    await runReview(agentConfig, defaultOptions);

    const verifyCall = mocks.runAgent.mock.calls[1];
    expect(verifyCall[0]).toBe("verification prompt");
    expect(verifyCall[4]).toBeUndefined();
  });

  it("returns all_failed when all specialists fail", async () => {
    mocks.runAgentsParallel.mockResolvedValue([
      { output: "", exitCode: 1, label: "Correctness" },
      { output: "", exitCode: 1, label: "Code Quality" },
      { output: "", exitCode: 1, label: "Test Quality" },
      { output: "", exitCode: 1, label: "Security & Perf" },
    ]);

    const result = await runReview(agentConfig, defaultOptions);
    expect(result).toEqual({ status: "all_failed" });
    expect(mocks.printError).toHaveBeenCalledWith("all reviewers failed");
    expect(mocks.saveReview).not.toHaveBeenCalled();
  });

  it("handles partial specialist failures gracefully", async () => {
    mocks.runAgentsParallel.mockResolvedValue([
      { output: "review 1", exitCode: 0, label: "Correctness" },
      { output: "", exitCode: 1, label: "Code Quality" },
      { output: "review 3", exitCode: 0, label: "Test Quality" },
      { output: "", exitCode: 1, label: "Security & Perf" },
    ]);

    await runReview(agentConfig, defaultOptions);

    expect(mocks.printWarning).toHaveBeenCalledWith('specialist "Code Quality" failed');
    expect(mocks.printWarning).toHaveBeenCalledWith('specialist "Security & Perf" failed');

    const synthCall = mocks.buildSynthesisPrompt.mock.calls[0];
    expect(synthCall[0]).toHaveLength(2);
    expect(synthCall[0][0].label).toBe("Correctness");
    expect(synthCall[0][1].label).toBe("Test Quality");
  });

  it("falls back to specialist outputs when synthesis fails", async () => {
    mocks.runAgent.mockReset();
    mocks.runAgent.mockResolvedValueOnce({ output: "", exitCode: 1 });

    await runReview(agentConfig, defaultOptions);

    expect(mocks.printWarning).toHaveBeenCalledWith("synthesis failed, showing specialist outputs");
    expect(mocks.printStep).not.toHaveBeenCalledWith(3, "verification", undefined, expect.any(String));
    expect(mocks.runAgent).toHaveBeenCalledTimes(1);
  });

  it("falls back to synthesized review when verification fails", async () => {
    mocks.runAgent.mockReset();
    mocks.runAgent
      .mockResolvedValueOnce({ output: "synthesized review", exitCode: 0 })
      .mockResolvedValueOnce({ output: "", exitCode: 1 });

    await runReview(agentConfig, defaultOptions);

    expect(mocks.printWarning).toHaveBeenCalledWith("verification failed, showing synthesized review");
    expect(stdoutSpy).toHaveBeenCalledWith("synthesized review");
  });

  it("prints header and config info", async () => {
    await runReview(agentConfig, defaultOptions);

    expect(mocks.printHeader).toHaveBeenCalledWith("code review");
    expect(mocks.printKv).toHaveBeenCalledWith("agent", "claude");
    expect(mocks.printKv).toHaveBeenCalledWith("branch", "feature-branch");
    expect(mocks.printKv).toHaveBeenCalledWith("target", "auto-detected");
  });

  it("omits commit log for working scope", async () => {
    mocks.resolveReviewTarget.mockResolvedValue({
      diffCmd: "git diff HEAD",
      scope: "working",
      range: "HEAD",
      description: "auto-detected",
    });

    await runReview(agentConfig, defaultOptions);

    expect(mocks.getCommitLog).not.toHaveBeenCalled();
  });

  it("fetches commit log for branch scope", async () => {
    await runReview(agentConfig, defaultOptions);
    expect(mocks.getCommitLog).toHaveBeenCalledWith("origin/main...HEAD");
  });

  it("saves final report and prints next-step hint on full success", async () => {
    await runReview(agentConfig, defaultOptions);

    expect(mocks.saveReview).toHaveBeenCalledWith("synthesized review\nfinal report\n<signal>APPROVED</signal>");
    expect(mocks.printKv).toHaveBeenCalledWith("next", "ralph fix");
  });

  it("saves synthesized review and prints next hint when verification fails", async () => {
    mocks.runAgent.mockReset();
    mocks.runAgent
      .mockResolvedValueOnce({ output: "synthesized review", exitCode: 0 })
      .mockResolvedValueOnce({ output: "", exitCode: 1 });

    await runReview(agentConfig, defaultOptions);

    expect(mocks.saveReview).toHaveBeenCalledWith("synthesized review");
    expect(mocks.printKv).toHaveBeenCalledWith("next", "ralph fix");
  });

  it("saves joined specialist outputs and prints next hint when synthesis fails", async () => {
    mocks.runAgent.mockReset();
    mocks.runAgent.mockResolvedValueOnce({ output: "", exitCode: 1 });

    await runReview(agentConfig, defaultOptions);

    const expected =
      "\n--- Correctness ---\nreview 1" +
      "\n--- Code Quality ---\nreview 2" +
      "\n--- Test Quality ---\nreview 3" +
      "\n--- Security & Perf ---\nreview 4";
    expect(mocks.saveReview).toHaveBeenCalledWith(expected);
    expect(mocks.printKv).toHaveBeenCalledWith("next", "ralph fix");
  });
});

describe("runReviewPipeline", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  const mockContext: CodeReviewContext = {
    diffCmd: "git diff origin/main...HEAD",
    scope: "branch",
    diffStat: " src/foo.ts | 10 ++++\n 1 file changed",
    commitLog: "abc123 some commit",
    branch: "feature-branch",
    description: "test review",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    mocks.buildSpecialistPrompt.mockResolvedValue("specialist prompt");
    mocks.buildSynthesisPrompt.mockResolvedValue("synthesis prompt");
    mocks.buildVerificationPrompt.mockResolvedValue("verification prompt");

    mocks.runAgentsParallel.mockResolvedValue([
      { output: "review 1", exitCode: 0, label: "Correctness" },
      { output: "review 2", exitCode: 0, label: "Code Quality" },
      { output: "review 3", exitCode: 0, label: "Test Quality" },
      { output: "review 4", exitCode: 0, label: "Security & Perf" },
    ]);

    mocks.runAgent
      .mockResolvedValueOnce({ output: "synthesized review", exitCode: 0 })
      .mockResolvedValueOnce({ output: "final report\n<signal>APPROVED</signal>", exitCode: 0 });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("returns combined review content on full success", async () => {
    const result = await runReviewPipeline(mockContext, agentConfig, defaultOptions);

    expect(result.reviewContent).toBe("synthesized review\nfinal report\n<signal>APPROVED</signal>");
    expect(result.fallback).toBe(false);
  });

  it("returns undefined reviewContent when all specialists fail", async () => {
    mocks.runAgentsParallel.mockResolvedValue([
      { output: "", exitCode: 1, label: "Correctness" },
      { output: "", exitCode: 1, label: "Code Quality" },
      { output: "", exitCode: 1, label: "Test Quality" },
      { output: "", exitCode: 1, label: "Security & Perf" },
    ]);

    const result = await runReviewPipeline(mockContext, agentConfig, defaultOptions);

    expect(result.reviewContent).toBeUndefined();
    expect(result.needsRevision).toBe(false);
    expect(result.fallback).toBe(false);
  });

  it("returns fallback with joined specialist outputs when synthesis fails", async () => {
    mocks.runAgent.mockReset();
    mocks.runAgent.mockResolvedValueOnce({ output: "", exitCode: 1 });

    const result = await runReviewPipeline(mockContext, agentConfig, defaultOptions);

    const expected =
      "\n--- Correctness ---\nreview 1" +
      "\n--- Code Quality ---\nreview 2" +
      "\n--- Test Quality ---\nreview 3" +
      "\n--- Security & Perf ---\nreview 4";
    expect(result.reviewContent).toBe(expected);
    expect(result.fallback).toBe(true);
  });

  it("returns fallback with synthesized review when verification fails", async () => {
    mocks.runAgent.mockReset();
    mocks.runAgent
      .mockResolvedValueOnce({ output: "synthesized review", exitCode: 0 })
      .mockResolvedValueOnce({ output: "", exitCode: 1 });

    const result = await runReviewPipeline(mockContext, agentConfig, defaultOptions);

    expect(result.reviewContent).toBe("synthesized review");
    expect(result.fallback).toBe(true);
  });

  it("sets needsRevision true when verification output contains NEEDS_REVISION signal", async () => {
    mocks.runAgent.mockReset();
    mocks.runAgent
      .mockResolvedValueOnce({ output: "synthesized review", exitCode: 0 })
      .mockResolvedValueOnce({ output: "Verdict: NEEDS REVISION\n<signal>NEEDS_REVISION</signal>", exitCode: 0 });

    const result = await runReviewPipeline(mockContext, agentConfig, defaultOptions);

    expect(result.needsRevision).toBe(true);
  });

  it("sets needsRevision false when verification output has no signal", async () => {
    mocks.runAgent.mockReset();
    mocks.runAgent
      .mockResolvedValueOnce({ output: "synthesized review", exitCode: 0 })
      .mockResolvedValueOnce({ output: "final report", exitCode: 0 });

    const result = await runReviewPipeline(mockContext, agentConfig, defaultOptions);

    expect(result.needsRevision).toBe(false);
    expect(mocks.printWarning).toHaveBeenCalledWith("no signal in verification output");
  });

  it("sets needsRevision based on verification signal, not synthesis content", async () => {
    mocks.runAgent.mockReset();
    mocks.runAgent
      .mockResolvedValueOnce({ output: "Final Verdict: NEEDS REVISION\n<signal>NEEDS_REVISION</signal>", exitCode: 0 })
      .mockResolvedValueOnce({ output: "Verification: APPROVED — all findings addressed.\n<signal>APPROVED</signal>", exitCode: 0 });

    const result = await runReviewPipeline(mockContext, agentConfig, defaultOptions);

    expect(result.needsRevision).toBe(false);
  });

  it("always sets needsRevision true on synthesis fallback", async () => {
    mocks.runAgent.mockReset();
    mocks.runAgent.mockResolvedValueOnce({ output: "", exitCode: 1 });

    mocks.runAgentsParallel.mockResolvedValue([
      { output: "NEEDS REVISION: found bugs", exitCode: 0, label: "Correctness" },
      { output: "looks fine", exitCode: 0, label: "Code Quality" },
      { output: "ok", exitCode: 0, label: "Test Quality" },
      { output: "ok", exitCode: 0, label: "Security & Perf" },
    ]);

    const result = await runReviewPipeline(mockContext, agentConfig, defaultOptions);

    expect(result.needsRevision).toBe(true);
    expect(result.fallback).toBe(true);
  });

  it("sets needsRevision on verification fallback when synthesis ends with NEEDS_REVISION signal", async () => {
    mocks.runAgent.mockReset();
    mocks.runAgent
      .mockResolvedValueOnce({ output: "problems found\n<signal>NEEDS_REVISION</signal>", exitCode: 0 })
      .mockResolvedValueOnce({ output: "", exitCode: 1 });

    const result = await runReviewPipeline(mockContext, agentConfig, defaultOptions);

    expect(result.needsRevision).toBe(true);
    expect(result.fallback).toBe(true);
  });

  it("does not trigger needsRevision when NEEDS REVISION appears in narrative but signal is APPROVED", async () => {
    mocks.runAgent.mockReset();
    mocks.runAgent
      .mockResolvedValueOnce({ output: "synthesized review", exitCode: 0 })
      .mockResolvedValueOnce({ output: "The original verdict was NEEDS REVISION but all issues resolved.\n<signal>APPROVED</signal>", exitCode: 0 });

    const result = await runReviewPipeline(mockContext, agentConfig, defaultOptions);

    expect(result.needsRevision).toBe(false);
  });

  it("calls printTimingSummary after each pipeline phase on full success", async () => {
    await runReviewPipeline(mockContext, agentConfig, defaultOptions);

    expect(mocks.printTimingSummary).toHaveBeenCalledTimes(3);
    for (const call of mocks.printTimingSummary.mock.calls) {
      expect(call[0]).toEqual(expect.any(Number));
      expect(call[1]).toEqual(expect.any(Number));
    }
  });

  it("calls printTimingSummary after specialists and synthesis when verification fails", async () => {
    mocks.runAgent.mockReset();
    mocks.runAgent
      .mockResolvedValueOnce({ output: "synthesized review", exitCode: 0 })
      .mockResolvedValueOnce({ output: "", exitCode: 1 });

    await runReviewPipeline(mockContext, agentConfig, defaultOptions);

    expect(mocks.printTimingSummary).toHaveBeenCalledTimes(3);
  });

  it("calls printTimingSummary after specialists and synthesis when synthesis fails", async () => {
    mocks.runAgent.mockReset();
    mocks.runAgent.mockResolvedValueOnce({ output: "", exitCode: 1 });

    await runReviewPipeline(mockContext, agentConfig, defaultOptions);

    expect(mocks.printTimingSummary).toHaveBeenCalledTimes(2);
  });

  it("calls printTimingSummary only after specialists when all specialists fail", async () => {
    mocks.runAgentsParallel.mockResolvedValue([
      { output: "", exitCode: 1, label: "Correctness" },
      { output: "", exitCode: 1, label: "Code Quality" },
      { output: "", exitCode: 1, label: "Test Quality" },
      { output: "", exitCode: 1, label: "Security & Perf" },
    ]);

    await runReviewPipeline(mockContext, agentConfig, defaultOptions);

    expect(mocks.printTimingSummary).toHaveBeenCalledTimes(1);
  });
});
