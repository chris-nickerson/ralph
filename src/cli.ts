import { Command } from "commander";
import { createRun, findRun, listRuns, outcomeStatus, saveRun, type RunMode } from "./store.js";
import { launchCodex, checkPrerequisites, probeClaude } from "./process.js";
import { makeInitialPrompt, makeResumePrompt } from "./workflow.js";

const program = new Command();
program.name("ralph").description("Run the ticket-pilot coding workflow").version("2.0.0");

async function resumeRun(runId: string | undefined, repo: string, instruction?: string): Promise<void> {
  const run = await findRun(repo, runId);
  if (!run.codexSessionId) throw new Error(`Run ${run.id} has no resumable Codex session`);
  await checkPrerequisites(run.mode);
  const result = await launchCodex(run, makeResumePrompt(run, instruction), true);
  run.lastExitCode = result.exitCode;
  run.status = await outcomeStatus(run, result.exitCode);
  run.updatedAt = new Date().toISOString();
  await saveRun(run);
  console.log(`\nRun ${run.id}: ${run.status}. Read ${run.dir}/workflow-state.md for the phase and remaining actions.`);
  if (result.exitCode !== 0) process.exitCode = result.exitCode;
}

program
  .command("run <task>")
  .description("Investigate, implement, validate, and prepare a PR")
  .option("--diagnose-only", "Stop after evidence-backed diagnosis and consensus")
  .option("--local-only", "Complete the workflow without remote writes")
  .option("--keep-draft", "Do not promote the PR to ready for review")
  .option("--repo <path>", "Repository to work in", process.cwd())
  .action(async (task: string, flags) => {
    if (flags.diagnoseOnly && flags.localOnly) throw new Error("Choose either --diagnose-only or --local-only");
    const mode: RunMode = flags.diagnoseOnly ? "diagnose-only" : flags.localOnly ? "local-only" : "full";
    const repo = flags.repo as string;
    await checkPrerequisites(mode);
    const run = await createRun(repo, task, mode, Boolean(flags.keepDraft));
    console.log(`Run ${run.id} · ${run.mode} · ${run.repo}`);
    const prompt = await makeInitialPrompt(run);
    const result = await launchCodex(run, prompt);
    run.codexSessionId = result.sessionId ?? run.codexSessionId;
    run.lastExitCode = result.exitCode;
    run.status = await outcomeStatus(run, result.exitCode);
    run.updatedAt = new Date().toISOString();
    await saveRun(run);
    console.log(`\nRun ${run.id}: ${run.status}. Inspect ${run.dir}/workflow-state.md and ${run.dir}/last-message.md.`);
    if (result.exitCode !== 0) process.exitCode = result.exitCode;
  });

program
  .command("plan <task>")
  .description("Reach a two-model diagnosis and design consensus without changing code")
  .option("--repo <path>", "Repository to work in", process.cwd())
  .action(async (task: string, flags) => {
    await checkPrerequisites("diagnose-only");
    const run = await createRun(flags.repo as string, task, "diagnose-only", false);
    console.log(`Run ${run.id} · plan · ${run.repo}`);
    const result = await launchCodex(run, await makeInitialPrompt(run));
    run.codexSessionId = result.sessionId ?? run.codexSessionId;
    run.lastExitCode = result.exitCode;
    run.status = await outcomeStatus(run, result.exitCode);
    run.updatedAt = new Date().toISOString();
    await saveRun(run);
    console.log(`\nRun ${run.id}: ${run.status}. Read ${run.dir}/consensus.md for the decision.`);
    if (result.exitCode !== 0) process.exitCode = result.exitCode;
  });

program
  .command("resume [run-id]")
  .description("Resume a run from its recorded Codex session")
  .option("--repo <path>", "Repository containing the run", process.cwd())
  .option("--instruction <text>", "Additional direction for this resume")
  .action(async (runId: string | undefined, flags) => resumeRun(runId, flags.repo as string, flags.instruction));

for (const [name, phase, instruction] of [
  ["simplify", "4", "Focus on phase 4: transfer exclusive edit ownership to Claude for first-principles simplification, then inspect, check, and checkpoint its edits. Verify prerequisite phase evidence before acting; do not skip it."],
  ["review", "5", "Focus on phase 5: fresh scoped correctness, compliance, and completeness review with bounded adjudication and repair. Verify prerequisite phase evidence before acting; do not skip it."],
  ["babysit", "7", "Focus on phase 7: inspect the current PR head, CI, and reviewer feedback, triage and repair within the remaining budget. Verify prerequisite phase evidence before acting; do not skip it."],
]) {
  program.command(`${name} [run-id]`)
    .description(`Resume a run at workflow phase ${phase} when its prerequisites are met`)
    .option("--repo <path>", "Repository containing the run", process.cwd())
    .action(async (runId: string | undefined, flags) => resumeRun(runId, flags.repo as string, instruction));
}

program
  .command("status [run-id]")
  .description("Show a run's durable status and evidence paths")
  .option("--repo <path>", "Repository containing the run", process.cwd())
  .action(async (runId: string | undefined, flags) => {
    const run = await findRun(flags.repo as string, runId);
    console.log(`${run.id} · ${run.status} · ${run.mode}\nTask: ${run.task}\nUpdated: ${run.updatedAt}\nSession: ${run.codexSessionId ?? "not started"}\nState: ${run.dir}/workflow-state.md\nLast message: ${run.dir}/last-message.md`);
  });

program
  .command("list")
  .description("List runs for this repository")
  .option("--repo <path>", "Repository containing the runs", process.cwd())
  .action(async (flags) => {
    const runs = await listRuns(flags.repo as string);
    for (const run of runs) console.log(`${run.id}\t${run.status}\t${run.mode}\t${run.task}`);
  });

program
  .command("doctor")
  .description("Check the CLIs used by the default Codex and Claude pairing")
  .option("--live", "Make a small Claude request to check auth and usage")
  .action(async (flags) => {
    await checkPrerequisites("full");
    if (flags.live) probeClaude();
    console.log(flags.live ? "CLIs installed and Claude responded." : "Codex, Claude, Git, and GitHub CLI are installed. Use --live to check Claude authentication and usage.");
  });

try {
  await program.parseAsync(process.argv);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
