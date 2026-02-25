import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { hasContent } from "./state.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function getPromptsDir(): string {
  return join(__dirname, "..", "prompts");
}

export async function loadPrompt(filename: string): Promise<string> {
  const filepath = join(getPromptsDir(), filename);
  try {
    return await readFile(filepath, "utf-8");
  } catch {
    throw new Error(`prompt file not found: ${filepath}`);
  }
}

export async function buildPlanPrompt(
  goal?: string,
  goalFile: string = "GOAL.md",
): Promise<string> {
  let prompt = await loadPrompt("plan.md");
  prompt += "\n\n## Goal\n\n";

  if (goal) {
    prompt += goal;
  } else if (await hasContent(goalFile)) {
    prompt += await readFile(goalFile, "utf-8");
  } else {
    prompt += "(No goal specified - audit existing specs against codebase)";
  }

  return prompt;
}

const NO_REVIEW_NO_COMMIT_OVERRIDE =
  "\n\n## Override: No Commits\n\nThere is no review step. Do NOT run `git add` or `git commit`. Leave all changes in the working tree.";

const NO_REVIEW_COMMIT_OVERRIDE =
  '\n\n## Override: Commit\n\nThere is no review step. After implementing and validating, commit your changes:\n\n```bash\ngit add -A\ngit commit -m "type: description"\n```\n\nUse conventional commit types: feat, fix, refactor, test, docs, chore\n\nThe commit message should describe what was implemented.\n\n**Do NOT commit:** `progress.txt`, `IMPLEMENTATION_PLAN.md`, or other Ralph infrastructure files.\n\n**Do NOT add co-author lines** or AI attribution to commit messages.';

const NO_COMMIT_OVERRIDE =
  "\n\n## Override: No Commits\n\nDo NOT run `git add` or `git commit`. Leave all changes in the working tree. Skip the Commit section above entirely.";

export async function buildBuildPrompt(
  noReview: boolean,
  noCommit: boolean,
): Promise<string> {
  let prompt = await loadPrompt("build.md");

  if (noReview) {
    prompt += noCommit ? NO_REVIEW_NO_COMMIT_OVERRIDE : NO_REVIEW_COMMIT_OVERRIDE;
  }

  return prompt;
}

export async function buildReviewPrompt(noCommit: boolean): Promise<string> {
  let prompt = await loadPrompt("review.md");
  if (noCommit) {
    prompt += NO_COMMIT_OVERRIDE;
  }
  return prompt;
}

export async function buildFinalReviewPrompt(
  startHash: string,
  noCommit: boolean,
): Promise<string> {
  let prompt = await loadPrompt("review_final.md");

  if (startHash) {
    prompt += "\n\n## Diff Range\n\n";
    if (noCommit) {
      prompt += `Review all changes from the start of this build: \`git diff ${startHash}\``;
    } else {
      prompt += `Review all changes from the start of this build: \`git diff ${startHash}..HEAD\``;
    }
  }

  if (noCommit) {
    prompt += NO_COMMIT_OVERRIDE;
  }

  return prompt;
}

export async function loadRefinePrompt(
  phase: "investigate" | "review",
): Promise<string> {
  const filename =
    phase === "investigate" ? "refine_investigate.md" : "refine_review.md";
  return loadPrompt(filename);
}
