import pc from "picocolors";
import { runAgent, runAgentsParallel } from "../agent.js";
import type { AgentConfig, RalphOptions } from "../agent.js";
import {
  resolveReviewTarget,
  isDiffEmpty,
  getCurrentBranch,
  getDiffStat,
  getCommitLog,
} from "../git.js";
import type { ReviewTarget } from "../git.js";
import {
  buildSpecialistPrompt,
  buildSynthesisPrompt,
  buildVerificationPrompt,
} from "../prompt.js";
import type { CodeReviewContext } from "../prompt.js";
import { parseSignal } from "../signal.js";
import { saveReview } from "../state.js";
import {
  dim,
  formatDuration,
  secondsSince,
  printHeader,
  printKv,
  printStep,
  printTimingSummary,
  printError,
  printWarning,
} from "../ui.js";

const SPECIALIST_LABELS = [
  "Correctness",
  "Code Quality",
  "Test Quality",
  "Security & Perf",
] as const;

const SPECIALIST_COLORS = [pc.cyan, pc.green, pc.magenta, pc.yellow];

export interface ReviewPipelineResult {
  reviewContent: string | undefined;
  needsRevision: boolean;
  fallback: boolean;
}

export async function runReviewPipeline(
  context: CodeReviewContext,
  config: AgentConfig,
  options: RalphOptions,
  startTime?: number,
): Promise<ReviewPipelineResult> {
  const pipelineStart = startTime ?? Date.now();

  // Phase 1: Specialists
  let elapsed = secondsSince(pipelineStart);
  printStep(1, "specialists", "4 parallel reviews", elapsed);

  let phaseStart = Date.now();

  const specialistPrompts = await Promise.all(
    ([1, 2, 3, 4] as const).map((i) => buildSpecialistPrompt(i, context)),
  );

  const tasks = specialistPrompts.map((prompt, i) => ({
    prompt,
    label: SPECIALIST_LABELS[i],
  }));

  const results = await runAgentsParallel(tasks, config, options, SPECIALIST_COLORS);

  let stepSeconds = secondsSince(phaseStart);
  let totalSeconds = secondsSince(pipelineStart);
  printTimingSummary(stepSeconds, totalSeconds);

  const successful = results.filter((r) => r.exitCode === 0 && r.output);
  const failed = results.filter((r) => r.exitCode !== 0 || !r.output);

  if (successful.length === 0) {
    return { reviewContent: undefined, needsRevision: false, fallback: false };
  }

  for (const f of failed) {
    printWarning(`specialist "${f.label}" failed`);
  }

  // Phase 2: Synthesis
  elapsed = secondsSince(pipelineStart);
  printStep(2, "synthesis", undefined, elapsed);

  phaseStart = Date.now();

  const specialistOutputs = successful.map((r) => ({
    label: r.label,
    output: r.output,
  }));

  const synthPrompt = await buildSynthesisPrompt(specialistOutputs, context);
  const synthResult = await runAgent(synthPrompt, config, options, "synthesizing", true);

  stepSeconds = secondsSince(phaseStart);
  totalSeconds = secondsSince(pipelineStart);
  printTimingSummary(stepSeconds, totalSeconds);

  if (synthResult.exitCode !== 0 || !synthResult.output) {
    printWarning("synthesis failed, showing specialist outputs");
    const joined = specialistOutputs.map((s) => `\n--- ${s.label} ---\n${s.output}`).join("");
    return {
      reviewContent: joined,
      needsRevision: true,
      fallback: true,
    };
  }

  const synthesizedReview = synthResult.output;

  // Phase 3: Verification
  elapsed = secondsSince(pipelineStart);
  printStep(3, "verification", undefined, elapsed);

  phaseStart = Date.now();

  const verifyPrompt = await buildVerificationPrompt(synthesizedReview, context);
  const verifyResult = await runAgent(verifyPrompt, config, options, "verifying");

  stepSeconds = secondsSince(phaseStart);
  totalSeconds = secondsSince(pipelineStart);
  printTimingSummary(stepSeconds, totalSeconds);

  if (verifyResult.exitCode !== 0 || !verifyResult.output) {
    printWarning("verification failed, showing synthesized review");
    const synthSignal = parseSignal(synthesizedReview);
    if (synthSignal === null) {
      printWarning("no signal in synthesis output, assuming revision needed");
    }
    return {
      reviewContent: synthesizedReview,
      needsRevision: synthSignal !== "APPROVED",
      fallback: true,
    };
  }

  const reviewContent = synthesizedReview + "\n" + verifyResult.output;
  const verifySignal = parseSignal(verifyResult.output);
  if (verifySignal === null) {
    printWarning("no signal in verification output");
  }
  return {
    reviewContent,
    needsRevision: verifySignal === "NEEDS_REVISION",
    fallback: false,
  };
}

export interface ReviewResult {
  status: "completed" | "empty_diff" | "all_failed";
}

export async function runReview(
  config: AgentConfig,
  options: RalphOptions,
  target: ReviewTarget = { type: "auto" },
): Promise<ReviewResult> {
  const { diffCmd, scope, range, description } = await resolveReviewTarget(target);

  const empty = await isDiffEmpty(range);
  if (empty) {
    printError("no changes to review");
    return { status: "empty_diff" };
  }

  const branch = await getCurrentBranch();
  const diffStat = await getDiffStat(range);
  const commitLog = scope === "branch" ? await getCommitLog(range) : "";

  const context: CodeReviewContext = { diffCmd, scope, diffStat, commitLog, branch, description };

  printHeader("code review");
  console.log("");
  printKv("agent", options.agent);
  printKv("branch", branch);
  printKv("target", description);
  printKv("diff", diffCmd);

  const startTime = Date.now();

  const { reviewContent, fallback } = await runReviewPipeline(context, config, options, startTime);

  if (reviewContent === undefined) {
    printError("all reviewers failed");
    return { status: "all_failed" };
  }

  if (fallback) {
    process.stdout.write(reviewContent);
  }

  await saveReview(reviewContent);
  printKv("next", "ralph fix");

  const elapsed = secondsSince(startTime);
  console.log("");
  console.log(dim(`  completed in ${formatDuration(elapsed)}`));

  return { status: "completed" };
}
