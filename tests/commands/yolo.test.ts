import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { RalphOptions } from "../../src/agent.js";

const mocks = vi.hoisted(() => ({
  runAgent: vi.fn(),
  runRefine: vi.fn(),
  runBuild: vi.fn(),
  clearStateFiles: vi.fn(),
  hasContent: vi.fn(),
  countTasks: vi.fn(),
  buildPlanPrompt: vi.fn(),
  printHeader: vi.fn(),
  printKv: vi.fn(),
  printError: vi.fn(),
}));

vi.mock("../../src/agent.js", () => ({
  runAgent: mocks.runAgent,
}));

vi.mock("../../src/commands/refine.js", () => ({
  runRefine: mocks.runRefine,
  DEFAULT_REFINE_ITERATIONS: 10,
}));

vi.mock("../../src/commands/build.js", () => ({
  runBuild: mocks.runBuild,
}));

vi.mock("../../src/state.js", () => ({
  clearStateFiles: mocks.clearStateFiles,
  hasContent: mocks.hasContent,
  countTasks: mocks.countTasks,
}));

vi.mock("../../src/prompt.js", () => ({
  buildPlanPrompt: mocks.buildPlanPrompt,
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
  printError: mocks.printError,
}));

import { runYolo } from "../../src/commands/yolo.js";

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

describe("runYolo", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("EXIT");
    }) as never);
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    mocks.runAgent.mockResolvedValue({ output: "done", exitCode: 0 });
    mocks.hasContent.mockResolvedValue(true);
    mocks.countTasks.mockResolvedValue(3);
    mocks.clearStateFiles.mockResolvedValue(undefined);
    mocks.buildPlanPrompt.mockResolvedValue("plan prompt");
    mocks.runRefine.mockResolvedValue({ done: true, iterations: 2 });
    mocks.runBuild.mockResolvedValue({ status: "completed", iterations: 3 });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("prints yolo header", async () => {
    await runYolo("my goal", agentConfig, defaultOptions);
    expect(mocks.printHeader).toHaveBeenCalledWith("yolo");
  });

  it("sets force to true", async () => {
    await runYolo("my goal", agentConfig, { ...defaultOptions, force: false });
    expect(mocks.runBuild).toHaveBeenCalledWith(
      10,
      agentConfig,
      expect.objectContaining({ force: true }),
      undefined,
    );
  });

  it("clears state files before planning", async () => {
    await runYolo("my goal", agentConfig, defaultOptions);
    expect(mocks.clearStateFiles).toHaveBeenCalled();
  });

  it("runs plan agent with goal", async () => {
    await runYolo("implement auth", agentConfig, defaultOptions);
    expect(mocks.buildPlanPrompt).toHaveBeenCalledWith("implement auth");
    expect(mocks.runAgent).toHaveBeenCalledWith(
      "plan prompt",
      agentConfig,
      expect.objectContaining({ force: true }),
      "planning",
      expect.any(Number),
    );
  });

  it("exits with error when plan agent fails to create plan", async () => {
    mocks.hasContent.mockResolvedValue(false);

    await expect(runYolo("goal", agentConfig, defaultOptions)).rejects.toThrow("EXIT");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mocks.printError).toHaveBeenCalledWith("agent did not create a plan");
  });

  it("calls runRefine after plan creation", async () => {
    await runYolo("goal", agentConfig, defaultOptions);
    expect(mocks.runRefine).toHaveBeenCalledWith(
      10,
      agentConfig,
      expect.objectContaining({ force: true }),
      undefined,
    );
  });

  it("skips refine when noRefine is true", async () => {
    await runYolo("goal", agentConfig, { ...defaultOptions, noRefine: true });
    expect(mocks.runRefine).not.toHaveBeenCalled();
  });

  it("calls runBuild after refine", async () => {
    await runYolo("goal", agentConfig, defaultOptions);
    expect(mocks.runBuild).toHaveBeenCalledWith(
      10,
      agentConfig,
      expect.objectContaining({ force: true }),
      undefined,
    );
  });

  it("exits 1 when build fails with agent_failed", async () => {
    mocks.runBuild.mockResolvedValue({ status: "agent_failed", iterations: 1 });

    await expect(runYolo("goal", agentConfig, defaultOptions)).rejects.toThrow("EXIT");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("completes successfully when build returns completed", async () => {
    mocks.runBuild.mockResolvedValue({ status: "completed", iterations: 3 });

    await runYolo("goal", agentConfig, defaultOptions);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("completes successfully when build returns limit_reached", async () => {
    mocks.runBuild.mockResolvedValue({ status: "limit_reached", iterations: 10 });

    await runYolo("goal", agentConfig, defaultOptions);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("completes successfully when build returns no_tasks", async () => {
    mocks.runBuild.mockResolvedValue({ status: "no_tasks", iterations: 0 });

    await runYolo("goal", agentConfig, defaultOptions);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("truncates long goals to 50 chars", async () => {
    const longGoal = "a".repeat(60);
    await runYolo(longGoal, agentConfig, defaultOptions);
    expect(mocks.printKv).toHaveBeenCalledWith("goal", "a".repeat(50) + "...");
  });

  it("prints phases with refine included by default", async () => {
    await runYolo("goal", agentConfig, defaultOptions);
    expect(mocks.printKv).toHaveBeenCalledWith("phases", "plan → refine → build → review");
  });

  it("prints phases without refine when noRefine is true", async () => {
    await runYolo("goal", agentConfig, { ...defaultOptions, noRefine: true });
    expect(mocks.printKv).toHaveBeenCalledWith("phases", "plan → build → review");
  });

  it("prints worktree info when provided", async () => {
    const worktreeInfo = { branch: "ralph/yolo-20260224", name: "repo-ralph-120000", dir: "/tmp/repo-ralph-120000" };
    await runYolo("goal", agentConfig, defaultOptions, worktreeInfo);
    expect(mocks.printKv).toHaveBeenCalledWith("branch", "ralph/yolo-20260224");
    expect(mocks.printKv).toHaveBeenCalledWith("path", "../repo-ralph-120000");
  });

  it("passes worktreeInfo to runRefine and runBuild", async () => {
    const worktreeInfo = { branch: "ralph/yolo-20260224", name: "repo-ralph-120000", dir: "/tmp/repo-ralph-120000" };
    await runYolo("goal", agentConfig, defaultOptions, worktreeInfo);
    expect(mocks.runRefine).toHaveBeenCalledWith(
      10,
      agentConfig,
      expect.objectContaining({ force: true }),
      worktreeInfo,
    );
    expect(mocks.runBuild).toHaveBeenCalledWith(
      10,
      agentConfig,
      expect.objectContaining({ force: true }),
      worktreeInfo,
    );
  });

  it("exits 1 when build returns no_plan", async () => {
    mocks.runBuild.mockResolvedValue({ status: "no_plan", iterations: 0 });

    await expect(runYolo("goal", agentConfig, defaultOptions)).rejects.toThrow("EXIT");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("exits 1 when build returns no_head", async () => {
    mocks.runBuild.mockResolvedValue({ status: "no_head", iterations: 0 });

    await expect(runYolo("goal", agentConfig, defaultOptions)).rejects.toThrow("EXIT");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
