import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RalphOptions } from "../../src/agent.js";

const mocks = vi.hoisted(() => ({
  validateAgent: vi.fn(),
  runAgent: vi.fn(),
  hasContent: vi.fn(),
  countTasks: vi.fn(),
  clearStateFiles: vi.fn(),
  buildPlanPrompt: vi.fn(),
  confirm: vi.fn(),
  printHeader: vi.fn(),
  printKv: vi.fn(),
  printWarning: vi.fn(),
  printWorktreeNext: vi.fn(),
}));

vi.mock("../../src/agent.js", () => ({
  validateAgent: mocks.validateAgent,
  runAgent: mocks.runAgent,
}));

vi.mock("../../src/state.js", () => ({
  hasContent: mocks.hasContent,
  countTasks: mocks.countTasks,
  clearStateFiles: mocks.clearStateFiles,
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
  printWorktreeNext: mocks.printWorktreeNext,
  confirm: mocks.confirm,
}));

import { runPlan } from "../../src/commands/plan.js";

const defaultOptions: RalphOptions = {
  agent: "claude",
  debug: false,
  force: false,
  noCommit: false,
  noReview: false,
  worktree: false,
};

const agentConfig = { name: "claude", command: "claude", args: ["-p"] };

describe("runPlan", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("EXIT");
    }) as never);

    mocks.validateAgent.mockReturnValue(agentConfig);
    mocks.runAgent.mockResolvedValue({ output: "done", exitCode: 0 });
    mocks.hasContent.mockResolvedValue(false);
    mocks.countTasks.mockResolvedValue(0);
    mocks.clearStateFiles.mockResolvedValue(undefined);
    mocks.buildPlanPrompt.mockResolvedValue("plan prompt");
    mocks.confirm.mockResolvedValue(true);
    mocks.printWorktreeNext.mockReturnValue(true);
  });

  it("confirms overwrite when state exists", async () => {
    const contentMap: Record<string, boolean> = {
      "IMPLEMENTATION_PLAN.md": true,
      "progress.txt": false,
    };
    mocks.hasContent.mockImplementation(async (p: string) => contentMap[p] ?? false);

    await runPlan("my goal", defaultOptions);

    expect(mocks.printWarning).toHaveBeenCalledWith("existing state will be cleared:");
    expect(mocks.confirm).toHaveBeenCalledWith("Continue?", "n", false);
    expect(mocks.clearStateFiles).toHaveBeenCalled();
  });

  it("exits when user declines overwrite", async () => {
    mocks.hasContent.mockImplementation(async (p: string) =>
      p === "IMPLEMENTATION_PLAN.md" ? true : false,
    );
    mocks.confirm.mockResolvedValue(false);

    await expect(runPlan("goal", defaultOptions)).rejects.toThrow("EXIT");
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(mocks.clearStateFiles).not.toHaveBeenCalled();
  });

  it("skips user interaction with --force", async () => {
    const contentMap: Record<string, boolean> = {
      "IMPLEMENTATION_PLAN.md": true,
      "progress.txt": true,
    };
    mocks.hasContent.mockImplementation(async (p: string) => contentMap[p] ?? false);

    await runPlan("goal", { ...defaultOptions, force: true });

    expect(mocks.confirm).toHaveBeenCalledWith("Continue?", "n", true);
    expect(mocks.clearStateFiles).toHaveBeenCalled();
  });

  it("clears state files before planning", async () => {
    await runPlan("goal", defaultOptions);
    expect(mocks.clearStateFiles).toHaveBeenCalled();
  });

  it("builds prompt with goal from arg", async () => {
    await runPlan("implement auth", defaultOptions);
    expect(mocks.buildPlanPrompt).toHaveBeenCalledWith("implement auth");
  });

  it("builds prompt with undefined goal when no arg", async () => {
    await runPlan(undefined, defaultOptions);
    expect(mocks.buildPlanPrompt).toHaveBeenCalledWith(undefined);
  });

  it("calls runAgent with correct params", async () => {
    await runPlan("goal", defaultOptions);

    expect(mocks.validateAgent).toHaveBeenCalledWith("claude");
    expect(mocks.runAgent).toHaveBeenCalledWith(
      "plan prompt",
      agentConfig,
      defaultOptions,
      "planning",
      expect.any(Number),
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
    await runPlan("goal", defaultOptions);

    expect(mocks.countTasks).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("5 tasks"));
    consoleSpy.mockRestore();
  });

  it("prints worktree next steps when worktreeInfo provided", async () => {
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
    await runPlan("goal", defaultOptions, worktreeInfo);
    consoleSpy.mockRestore();

    expect(mocks.printWorktreeNext).toHaveBeenCalledWith("plan", worktreeInfo, "ralph", "plan");
  });

  it("prints header with planning mode", async () => {
    await runPlan("goal", defaultOptions);
    expect(mocks.printHeader).toHaveBeenCalledWith("planning");
  });

  it("prints agent info", async () => {
    await runPlan("goal", defaultOptions);
    expect(mocks.printKv).toHaveBeenCalledWith("agent", "claude");
  });
});
