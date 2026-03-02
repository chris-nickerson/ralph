import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RalphOptions } from "../../src/agent.js";

const mocks = vi.hoisted(() => ({
  runAgent: vi.fn(),
  runRefine: vi.fn(),
  hasContent: vi.fn(),
  countTasks: vi.fn(),
  clearStateFiles: vi.fn(),
  buildPlanPrompt: vi.fn(),
  confirm: vi.fn(),
  printHeader: vi.fn(),
  printKv: vi.fn(),
  printWarning: vi.fn(),
  printError: vi.fn(),
  printWorktreeNext: vi.fn(),
}));

vi.mock("../../src/agent.js", () => ({
  runAgent: mocks.runAgent,
}));

vi.mock("../../src/commands/refine.js", () => ({
  runRefine: mocks.runRefine,
  DEFAULT_REFINE_ITERATIONS: 10,
}));

vi.mock("../../src/state.js", () => ({
  hasContent: mocks.hasContent,
  countTasks: mocks.countTasks,
  clearStateFiles: mocks.clearStateFiles,
  GOAL_FILE: "GOAL.md",
}));

vi.mock("../../src/prompt.js", () => ({
  buildPlanPrompt: mocks.buildPlanPrompt,
}));

vi.mock("../../src/ui.js", () => ({
  dim: (s: string) => s,
  green: (s: string) => s,
  SYM_DOT: ".",
  SYM_CHECK: "done",
  SYM_BULLET: "*",
  line: () => "-".repeat(74),
  formatDuration: (s: number) => `${s}s`,
  printHeader: mocks.printHeader,
  printKv: mocks.printKv,
  printWarning: mocks.printWarning,
  printError: mocks.printError,
  printWorktreeNext: mocks.printWorktreeNext,
  confirm: mocks.confirm,
}));

import { runPlan } from "../../src/commands/plan.js";

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

describe("runPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.runAgent.mockResolvedValue({ output: "done", exitCode: 0 });
    let planCheckCount = 0;
    mocks.hasContent.mockImplementation(async (p: string) => {
      if (p === "IMPLEMENTATION_PLAN.md") {
        planCheckCount++;
        return planCheckCount > 1;
      }
      return false;
    });
    mocks.countTasks.mockResolvedValue(0);
    mocks.clearStateFiles.mockResolvedValue(undefined);
    mocks.buildPlanPrompt.mockResolvedValue("plan prompt");
    mocks.confirm.mockResolvedValue(true);
    mocks.runRefine.mockResolvedValue({ done: true, iterations: 2 });
    mocks.printWorktreeNext.mockReturnValue(true);
  });

  it("confirms overwrite when state exists", async () => {
    const contentMap: Record<string, boolean> = {
      "IMPLEMENTATION_PLAN.md": true,
      "progress.txt": false,
    };
    mocks.hasContent.mockImplementation(async (p: string) => contentMap[p] ?? false);

    await runPlan("my goal", agentConfig, defaultOptions);

    expect(mocks.printWarning).toHaveBeenCalledWith("existing state will be cleared:");
    expect(mocks.confirm).toHaveBeenCalledWith("Continue?", "n", false);
    expect(mocks.clearStateFiles).toHaveBeenCalled();
  });

  it("returns cancelled when user declines overwrite", async () => {
    mocks.hasContent.mockImplementation(async (p: string) =>
      p === "IMPLEMENTATION_PLAN.md" ? true : false,
    );
    mocks.confirm.mockResolvedValue(false);

    const result = await runPlan("goal", agentConfig, defaultOptions);
    expect(result).toEqual({ status: "cancelled", taskCount: 0 });
    expect(mocks.clearStateFiles).not.toHaveBeenCalled();
  });

  it("skips user interaction with --force", async () => {
    const contentMap: Record<string, boolean> = {
      "IMPLEMENTATION_PLAN.md": true,
      "progress.txt": true,
    };
    mocks.hasContent.mockImplementation(async (p: string) => contentMap[p] ?? false);

    await runPlan("goal", agentConfig, { ...defaultOptions, force: true });

    expect(mocks.confirm).toHaveBeenCalledWith("Continue?", "n", true);
    expect(mocks.clearStateFiles).toHaveBeenCalled();
  });

  it("clears state files before planning", async () => {
    await runPlan("goal", agentConfig, defaultOptions);
    expect(mocks.clearStateFiles).toHaveBeenCalled();
  });

  it("builds prompt with goal from arg", async () => {
    await runPlan("implement auth", agentConfig, defaultOptions);
    expect(mocks.buildPlanPrompt).toHaveBeenCalledWith("implement auth");
  });

  it("builds prompt with undefined goal when no arg", async () => {
    await runPlan(undefined, agentConfig, defaultOptions);
    expect(mocks.buildPlanPrompt).toHaveBeenCalledWith(undefined);
  });

  it("calls runAgent with correct params", async () => {
    await runPlan("goal", agentConfig, defaultOptions);

    expect(mocks.runAgent).toHaveBeenCalledWith(
      "plan prompt",
      agentConfig,
      defaultOptions,
      "planning",
    );
  });

  it("prints completion with task count when plan created", async () => {
    let callCount = 0;
    mocks.hasContent.mockImplementation(async (p: string) => {
      if (p === "IMPLEMENTATION_PLAN.md") {
        callCount++;
        return callCount > 1;
      }
      return false;
    });
    mocks.countTasks.mockResolvedValue(5);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await runPlan("goal", agentConfig, defaultOptions);

    expect(result).toEqual({ status: "created", taskCount: 5 });
    expect(mocks.countTasks).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("5 tasks"));
    consoleSpy.mockRestore();
  });

  it("prints worktree next steps when worktreeInfo provided and noRefine", async () => {
    let callCount = 0;
    mocks.hasContent.mockImplementation(async (p: string) => {
      if (p === "IMPLEMENTATION_PLAN.md") {
        callCount++;
        return callCount > 1;
      }
      return false;
    });
    mocks.countTasks.mockResolvedValue(3);

    const worktreeInfo = { branch: "ralph/plan-20260224", name: "repo-ralph-120000", dir: "/tmp/repo-ralph-120000" };
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runPlan("goal", agentConfig, { ...defaultOptions, noRefine: true }, worktreeInfo);
    consoleSpy.mockRestore();

    expect(mocks.printWorktreeNext).toHaveBeenCalledWith("build", worktreeInfo, "ralph", "plan");
  });

  it("returns failed when no plan is created", async () => {
    mocks.hasContent.mockResolvedValue(false);
    mocks.runAgent.mockResolvedValue({ output: "", exitCode: 1 });

    const result = await runPlan("goal", agentConfig, defaultOptions);
    expect(result).toEqual({ status: "failed", taskCount: 0 });
    expect(mocks.countTasks).not.toHaveBeenCalled();
  });

  it("prints header with planning mode", async () => {
    await runPlan("goal", agentConfig, defaultOptions);
    expect(mocks.printHeader).toHaveBeenCalledWith("planning");
  });

  it("prints agent info", async () => {
    await runPlan("goal", agentConfig, defaultOptions);
    expect(mocks.printKv).toHaveBeenCalledWith("agent", "claude");
  });

  it("calls runRefine after plan creation by default", async () => {
    await runPlan("goal", agentConfig, defaultOptions);
    expect(mocks.runRefine).toHaveBeenCalledWith(10, agentConfig, defaultOptions, undefined);
  });

  it("skips runRefine when noRefine is true", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runPlan("goal", agentConfig, { ...defaultOptions, noRefine: true });
    consoleSpy.mockRestore();
    expect(mocks.runRefine).not.toHaveBeenCalled();
  });

  it("passes worktreeInfo to runRefine", async () => {
    const worktreeInfo = { branch: "ralph/plan-20260224", name: "repo-ralph-120000", dir: "/tmp/repo-ralph-120000" };
    await runPlan("goal", agentConfig, defaultOptions, worktreeInfo);
    expect(mocks.runRefine).toHaveBeenCalledWith(10, agentConfig, defaultOptions, worktreeInfo);
  });
});
