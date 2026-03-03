import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { RalphOptions } from "../../src/agent.js";

const mocks = vi.hoisted(() => ({
  runAgent: vi.fn(),
  buildFixPrompt: vi.fn(),
  loadReview: vi.fn(),
  printHeader: vi.fn(),
  printKv: vi.fn(),
  printError: vi.fn(),
}));

vi.mock("../../src/agent.js", () => ({
  runAgent: mocks.runAgent,
}));

vi.mock("../../src/prompt.js", () => ({
  buildFixPrompt: mocks.buildFixPrompt,
}));

vi.mock("../../src/state.js", () => ({
  loadReview: mocks.loadReview,
}));

vi.mock("../../src/ui.js", () => ({
  dim: (s: string) => s,
  formatDuration: (s: number) => `${s}s`,
  green: (s: string) => s,
  line: () => "-".repeat(74),
  secondsSince: (start: number) => Math.max(0, Math.floor((Date.now() - start) / 1000)),
  printHeader: mocks.printHeader,
  printKv: mocks.printKv,
  printError: mocks.printError,
  SYM_CHECK: "done",
  SYM_DOT: ".",
}));

import { runFix } from "../../src/commands/fix.js";

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

describe("runFix", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    mocks.loadReview.mockResolvedValue("## Review findings\n\nSome issue here");
    mocks.buildFixPrompt.mockResolvedValue("fix prompt content");
    mocks.runAgent.mockResolvedValue({ output: "done", exitCode: 0 });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("returns no_review when no review found", async () => {
    mocks.loadReview.mockRejectedValue(new Error("no review found; run ralph review first"));

    const result = await runFix(undefined, agentConfig, defaultOptions);
    expect(result).toEqual({ status: "no_review" });
    expect(mocks.printError).toHaveBeenCalledWith("no review found; run ralph review first");
  });

  it("runs agent once with fix prompt and returns completed", async () => {
    const result = await runFix(undefined, agentConfig, defaultOptions);

    expect(result).toEqual({ status: "completed" });
    expect(mocks.runAgent).toHaveBeenCalledTimes(1);
    expect(mocks.runAgent).toHaveBeenCalledWith(
      "fix prompt content",
      agentConfig,
      defaultOptions,
      "fixing",
    );
  });

  it("builds prompt with review content and no instructions", async () => {
    await runFix(undefined, agentConfig, defaultOptions);

    expect(mocks.buildFixPrompt).toHaveBeenCalledWith(
      "## Review findings\n\nSome issue here",
      undefined,
      false,
    );
  });

  it("passes instructions to buildFixPrompt", async () => {
    await runFix("be conservative", agentConfig, defaultOptions);

    expect(mocks.buildFixPrompt).toHaveBeenCalledWith(
      "## Review findings\n\nSome issue here",
      "be conservative",
      false,
    );
  });

  it("passes noCommit flag to buildFixPrompt", async () => {
    const opts = { ...defaultOptions, noCommit: true };
    await runFix(undefined, agentConfig, opts);

    expect(mocks.buildFixPrompt).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      true,
    );
  });

  it("prints header and agent", async () => {
    await runFix(undefined, agentConfig, defaultOptions);

    expect(mocks.printHeader).toHaveBeenCalledWith("fix");
    expect(mocks.printKv).toHaveBeenCalledWith("agent", "claude");
  });

  it("does not print instructions kv when undefined", async () => {
    await runFix(undefined, agentConfig, defaultOptions);

    const instructionsCalls = mocks.printKv.mock.calls.filter(
      ([key]: [string]) => key === "instructions",
    );
    expect(instructionsCalls).toHaveLength(0);
  });

  it("prints instructions kv when provided", async () => {
    await runFix("be conservative", agentConfig, defaultOptions);

    expect(mocks.printKv).toHaveBeenCalledWith("instructions", "be conservative");
  });

  it("prints unified completion message with fix complete", async () => {
    await runFix(undefined, agentConfig, defaultOptions);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("fix complete"));
  });
});
