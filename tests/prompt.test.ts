import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  loadPrompt,
  buildPlanPrompt,
  buildBuildPrompt,
  buildReviewPrompt,
  buildFinalReviewPrompt,
  loadRefinePrompt,
  buildSpecialistPrompt,
  buildSynthesisPrompt,
  buildVerificationPrompt,
  type CodeReviewContext,
} from "../src/prompt.js";

describe("loadPrompt", () => {
  it("loads a prompt file and returns its content", async () => {
    const content = await loadPrompt("plan.md");
    expect(content).toContain("PLANNING mode");
  });

  it("throws for a missing prompt file", async () => {
    await expect(loadPrompt("nonexistent.md")).rejects.toThrow(
      "prompt file not found",
    );
  });
});

describe("buildPlanPrompt", () => {
  it("appends goal from argument", async () => {
    const prompt = await buildPlanPrompt("Build a REST API");
    expect(prompt).toContain("## Goal");
    expect(prompt).toContain("Build a REST API");
  });

  it("appends goal from file when no arg given", async () => {
    const dir = join(tmpdir(), `ralph-test-plan-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "GOAL.md"), "Rewrite in Rust");
    const origCwd = process.cwd();
    process.chdir(dir);

    try {
      const prompt = await buildPlanPrompt(undefined, join(dir, "GOAL.md"));
      expect(prompt).toContain("## Goal");
      expect(prompt).toContain("Rewrite in Rust");
    } finally {
      process.chdir(origCwd);
    }
  });

  it("uses audit mode when no goal and no file", async () => {
    const dir = join(tmpdir(), `ralph-test-audit-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const origCwd = process.cwd();
    process.chdir(dir);

    try {
      const prompt = await buildPlanPrompt(
        undefined,
        join(dir, "GOAL.md"),
      );
      expect(prompt).toContain("## Goal");
      expect(prompt).toContain("audit existing specs");
    } finally {
      process.chdir(origCwd);
    }
  });
});

describe("buildBuildPrompt", () => {
  it("returns base prompt with no overrides when review enabled", async () => {
    const prompt = await buildBuildPrompt(false, false);
    expect(prompt).toContain("BUILD mode");
    expect(prompt).not.toContain("Override");
  });

  it("appends no-review + no-commit override", async () => {
    const prompt = await buildBuildPrompt(true, true);
    expect(prompt).toContain("## Override: No Commits");
    expect(prompt).toContain("There is no review step");
    expect(prompt).toContain("Leave all changes in the working tree");
    expect(prompt).not.toContain("git add -A");
  });

  it("appends no-review + commit override", async () => {
    const prompt = await buildBuildPrompt(true, false);
    expect(prompt).toContain("## Override: Commit");
    expect(prompt).toContain("There is no review step");
    expect(prompt).toContain("git add -A");
    expect(prompt).toContain("conventional commit types");
    expect(prompt).toContain("Do NOT commit:");
    expect(prompt).toContain("Do NOT add co-author lines");
  });

  it("does not append override when review enabled even with no-commit", async () => {
    const prompt = await buildBuildPrompt(false, true);
    expect(prompt).not.toContain("Override");
  });
});

describe("buildReviewPrompt", () => {
  it("returns base prompt without override when commits allowed", async () => {
    const prompt = await buildReviewPrompt(false);
    expect(prompt).toContain("REVIEW mode");
    expect(prompt).not.toContain("Override");
  });

  it("appends no-commit override", async () => {
    const prompt = await buildReviewPrompt(true);
    expect(prompt).toContain("## Override: No Commits");
    expect(prompt).toContain("Skip the Commit section above entirely");
  });
});

describe("buildFinalReviewPrompt", () => {
  it("includes diff range with commit hash", async () => {
    const prompt = await buildFinalReviewPrompt("abc123", false);
    expect(prompt).toContain("## Diff Range");
    expect(prompt).toContain("git diff abc123..HEAD");
  });

  it("uses plain diff when no-commit", async () => {
    const prompt = await buildFinalReviewPrompt("abc123", true);
    expect(prompt).toContain("git diff abc123");
    expect(prompt).not.toContain("abc123..HEAD");
  });

  it("appends no-commit override", async () => {
    const prompt = await buildFinalReviewPrompt("abc123", true);
    expect(prompt).toContain("## Override: No Commits");
    expect(prompt).toContain("Skip the Commit section above entirely");
  });

  it("skips diff range when no start hash", async () => {
    const prompt = await buildFinalReviewPrompt("", false);
    expect(prompt).not.toContain("## Diff Range");
  });
});

describe("loadRefinePrompt", () => {
  it("loads investigate prompt", async () => {
    const prompt = await loadRefinePrompt("investigate");
    expect(prompt).toContain("investigation phase");
  });

  it("loads review prompt", async () => {
    const prompt = await loadRefinePrompt("review");
    expect(prompt).toContain("review phase");
  });
});

const branchContext: CodeReviewContext = {
  diffCmd: "git diff origin/main...HEAD",
  scope: "branch",
  diffStat: " src/foo.ts | 10 ++++\n 1 file changed",
  commitLog: "abc1234 add foo\ndef5678 fix bar",
  branch: "feature-x",
  description: "auto-detected",
};

const workingContext: CodeReviewContext = {
  diffCmd: "git diff HEAD",
  scope: "working",
  diffStat: " src/bar.ts | 3 +++\n 1 file changed",
  commitLog: "",
  branch: "main",
  description: "auto-detected",
};

describe("buildSpecialistPrompt", () => {
  it("loads the correct prompt file for each index", async () => {
    const p1 = await buildSpecialistPrompt(1, branchContext);
    expect(p1).toContain("find bugs");

    const p3 = await buildSpecialistPrompt(3, branchContext);
    expect(p3).toContain("test");
  });

  it("includes review context with diff command and stat", async () => {
    const prompt = await buildSpecialistPrompt(1, branchContext);
    expect(prompt).toContain("## Review Context");
    expect(prompt).toContain("`git diff origin/main...HEAD`");
    expect(prompt).toContain("### File Change Summary");
    expect(prompt).toContain("src/foo.ts | 10 ++++");
  });

  it("includes commit history for branch scope", async () => {
    const prompt = await buildSpecialistPrompt(2, branchContext);
    expect(prompt).toContain("### Commit History");
    expect(prompt).toContain("abc1234 add foo");
  });

  it("omits commit history for working scope", async () => {
    const prompt = await buildSpecialistPrompt(2, workingContext);
    expect(prompt).not.toContain("### Commit History");
  });
});

describe("buildSynthesisPrompt", () => {
  const outputs = [
    { label: "Specialist 1: Correctness", output: "Found a null bug" },
    { label: "Specialist 2: Code Quality", output: "Naming is inconsistent" },
  ];

  it("loads the synthesis prompt file", async () => {
    const prompt = await buildSynthesisPrompt(outputs, branchContext);
    expect(prompt).toContain("synthesizing 4 specialist code reviews");
  });

  it("includes review info with scope and branch", async () => {
    const prompt = await buildSynthesisPrompt(outputs, branchContext);
    expect(prompt).toContain("## Review Info");
    expect(prompt).toContain("**Scope**: auto-detected (branch)");
    expect(prompt).toContain("**Branch**: feature-x");
    expect(prompt).toContain("src/foo.ts | 10 ++++");
  });

  it("includes all specialist outputs as labeled sections", async () => {
    const prompt = await buildSynthesisPrompt(outputs, branchContext);
    expect(prompt).toContain("## Specialist Outputs");
    expect(prompt).toContain("### Specialist 1: Correctness");
    expect(prompt).toContain("Found a null bug");
    expect(prompt).toContain("### Specialist 2: Code Quality");
    expect(prompt).toContain("Naming is inconsistent");
  });
});

describe("buildVerificationPrompt", () => {
  const synthesized = "# Code Review\n\n## Critical Issues\n\n### Null deref in foo.ts";

  it("loads the verification prompt file", async () => {
    const prompt = await buildVerificationPrompt(synthesized, branchContext);
    expect(prompt).toContain("skeptical investigator");
  });

  it("includes synthesized review", async () => {
    const prompt = await buildVerificationPrompt(synthesized, branchContext);
    expect(prompt).toContain("## Synthesized Review to Verify");
    expect(prompt).toContain("Null deref in foo.ts");
  });

  it("includes verification context with diff command and stat", async () => {
    const prompt = await buildVerificationPrompt(synthesized, branchContext);
    expect(prompt).toContain("## Verification Context");
    expect(prompt).toContain("`git diff origin/main...HEAD`");
    expect(prompt).toContain("### File Change Summary");
    expect(prompt).toContain("src/foo.ts | 10 ++++");
  });
});
