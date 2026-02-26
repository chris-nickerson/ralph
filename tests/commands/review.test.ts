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
  printHeader: vi.fn(),
  printKv: vi.fn(),
  printStep: vi.fn(),
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

vi.mock("../../src/ui.js", () => ({
  dim: (s: string) => s,
  formatDuration: (s: number) => `${s}s`,
  printHeader: mocks.printHeader,
  printKv: mocks.printKv,
  printStep: mocks.printStep,
  printError: mocks.printError,
  printWarning: mocks.printWarning,
}));

import { runReview } from "../../src/commands/review.js";

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
    .mockResolvedValueOnce({ output: "final report", exitCode: 0 });
}

describe("runReview", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("EXIT");
    }) as never);
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    setupDefaults();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  it("exits when diff is empty", async () => {
    mocks.isDiffEmpty.mockResolvedValue(true);

    await expect(runReview(agentConfig, defaultOptions)).rejects.toThrow("EXIT");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mocks.printError).toHaveBeenCalledWith("no changes to review");
  });

  it("forwards target to resolveReviewTarget", async () => {
    await runReview(agentConfig, defaultOptions, { type: "staged" });
    expect(mocks.resolveReviewTarget).toHaveBeenCalledWith({ type: "staged" });
  });

  it("runs all 3 phases in order", async () => {
    await runReview(agentConfig, defaultOptions);

    expect(mocks.printStep).toHaveBeenCalledWith(1, "specialists", "4 parallel reviews");
    expect(mocks.runAgentsParallel).toHaveBeenCalledTimes(1);

    expect(mocks.printStep).toHaveBeenCalledWith(2, "synthesis");
    expect(mocks.printStep).toHaveBeenCalledWith(3, "verification");
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
    expect(synthCall[5]).toBe(true);
  });

  it("does not pass silent for verification agent", async () => {
    await runReview(agentConfig, defaultOptions);

    const verifyCall = mocks.runAgent.mock.calls[1];
    expect(verifyCall[0]).toBe("verification prompt");
    expect(verifyCall[5]).toBeUndefined();
  });

  it("exits with error when all specialists fail", async () => {
    mocks.runAgentsParallel.mockResolvedValue([
      { output: "", exitCode: 1, label: "Correctness" },
      { output: "", exitCode: 1, label: "Code Quality" },
      { output: "", exitCode: 1, label: "Test Quality" },
      { output: "", exitCode: 1, label: "Security & Perf" },
    ]);

    await expect(runReview(agentConfig, defaultOptions)).rejects.toThrow("EXIT");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mocks.printError).toHaveBeenCalledWith("all reviewers failed");
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
    expect(mocks.printStep).not.toHaveBeenCalledWith(3, "verification");
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
});
