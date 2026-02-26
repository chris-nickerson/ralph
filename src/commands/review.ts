import { runAgent, runAgentsParallel } from "../agent.js";
import type { AgentConfig, RalphOptions } from "../agent.js";
import {
  determineDiffScope,
  isDiffEmpty,
  getCurrentBranch,
  getDiffStat,
  getCommitLog,
} from "../git.js";
import {
  buildSpecialistPrompt,
  buildSynthesisPrompt,
  buildVerificationPrompt,
} from "../prompt.js";
import type { CodeReviewContext } from "../prompt.js";
import {
  dim,
  formatDuration,
  printHeader,
  printKv,
  printStep,
  printError,
  printWarning,
} from "../ui.js";

const SPECIALIST_LABELS = [
  "Correctness",
  "Code Quality",
  "Test Quality",
  "Security & Perf",
] as const;

export async function runReview(
  config: AgentConfig,
  options: RalphOptions,
  scopeOverride?: string,
): Promise<void> {
  const { diffCmd, scope, range } = await determineDiffScope(scopeOverride);

  const empty = await isDiffEmpty(range);
  if (empty) {
    printError("no changes to review");
    process.exit(1);
  }

  const branch = await getCurrentBranch();
  const diffStat = await getDiffStat(range);
  const commitLog = scope === "branch" ? await getCommitLog(range) : "";

  const context: CodeReviewContext = { diffCmd, scope, diffStat, commitLog, branch };

  printHeader("code review");
  console.log("");
  printKv("agent", options.agent);
  printKv("branch", branch);
  printKv("scope", scope);
  printKv("diff", diffCmd);

  const startTime = Date.now();

  // Phase 1: Specialists
  printStep(1, "specialists", "4 parallel reviews");

  const specialistPrompts = await Promise.all(
    ([1, 2, 3, 4] as const).map((i) => buildSpecialistPrompt(i, context)),
  );

  const tasks = specialistPrompts.map((prompt, i) => ({
    prompt,
    label: SPECIALIST_LABELS[i],
  }));

  const results = await runAgentsParallel(tasks, config, options, "reviewing", startTime);

  const successful = results.filter((r) => r.exitCode === 0 && r.output);
  const failed = results.filter((r) => r.exitCode !== 0 || !r.output);

  if (successful.length === 0) {
    printError("all reviewers failed");
    process.exit(1);
  }

  for (const f of failed) {
    printWarning(`specialist "${f.label}" failed`);
  }

  // Phase 2: Synthesis
  printStep(2, "synthesis");

  const specialistOutputs = successful.map((r) => ({
    label: r.label,
    output: r.output,
  }));

  const synthPrompt = await buildSynthesisPrompt(specialistOutputs, context);
  const synthResult = await runAgent(synthPrompt, config, options, "synthesizing", startTime, true);

  let synthesizedReview: string | undefined;

  if (synthResult.exitCode !== 0 || !synthResult.output) {
    printWarning("synthesis failed, showing specialist outputs");
    for (const s of specialistOutputs) {
      process.stdout.write(`\n--- ${s.label} ---\n`);
      process.stdout.write(s.output);
    }
  } else {
    synthesizedReview = synthResult.output;

    // Phase 3: Verification
    printStep(3, "verification");

    const verifyPrompt = await buildVerificationPrompt(synthesizedReview, context);
    const verifyResult = await runAgent(verifyPrompt, config, options, "verifying", startTime);

    if (verifyResult.exitCode !== 0 || !verifyResult.output) {
      printWarning("verification failed, showing synthesized review");
      process.stdout.write(synthesizedReview);
    }
  }

  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  console.log("");
  console.log(dim(`  completed in ${formatDuration(elapsed)}`));
}
