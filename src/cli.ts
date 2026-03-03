import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { killAgent, validateAgent, checkAgentInstalled } from "./agent.js";
import type { RalphOptions } from "./agent.js";
import { createWorktree, getRepoRoot } from "./git.js";
import type { WorktreeInfo } from "./git.js";
import { dim, printError, printWarning } from "./ui.js";

process.title = "ralph";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf-8"),
);

let worktreeInfo: WorktreeInfo | undefined;
let worktreeDone = false;

function onSignal(): void {
  killAgent();
  process.stdout.write("\x1b[?25h");
  if (worktreeInfo && !worktreeDone) {
    process.stderr.write(
      `  ${dim(`worktree remains at ../${worktreeInfo.name}`)}\n`,
    );
  }
  process.exit(1);
}

process.on("SIGINT", onSignal);
process.on("SIGTERM", onSignal);

function makeOptions(cmd: Command): RalphOptions {
  const opts = cmd.optsWithGlobals();
  const timeoutStr = opts.timeout ?? "0";
  if (!/^\d+$/.test(timeoutStr)) {
    throw new Error("--timeout must be a non-negative integer");
  }
  return {
    agent: opts.agent ?? "cursor",
    debug: opts.debug ?? false,
    force: opts.force ?? false,
    noCommit: opts.commit === false,
    noRefine: opts.refine === false,
    noReview: opts.review === false,
    worktree: opts.worktree ?? false,
    timeout: parseInt(timeoutStr, 10),
  };
}

async function setupWorktree(
  mode: string,
): Promise<WorktreeInfo | undefined> {
  const repoRoot = await getRepoRoot();
  const info = await createWorktree(mode, repoRoot);
  worktreeInfo = info;
  process.chdir(info.dir);
  return info;
}

const program = new Command();

program
  .name("ralph")
  .description("autonomous coding loop")
  .version(pkg.version)
  .option("-a, --agent <name>", "Agent to use: claude, codex, cursor", "cursor")
  .option("-d, --debug", "Run agent in foreground (see output in real-time)")
  .option("-f, --force", "Skip confirmation prompts")
  .option("-n, --no-commit", "Skip commits (leave changes in working tree)")
  .option("--no-refine", "Skip plan refinement (create plan only)")
  .option("--no-review", "Skip final code review")
  .option("-w, --worktree", "Run in a git worktree (isolates changes)")
  .option("-t, --timeout <seconds>", "Agent timeout in seconds (0 = none)", "0");

program
  .command("plan [goal]")
  .description("Create implementation plan")
  .action(async (goal: string | undefined) => {
    const options = makeOptions(program);
    const config = validateAgent(options.agent);
    checkAgentInstalled(config);
    const wt = options.worktree
      ? await setupWorktree("plan")
      : undefined;
    const { runPlan } = await import("./commands/plan.js");
    const result = await runPlan(goal, config, options, wt);
    worktreeDone = true;
    if (result.status === "failed") process.exit(1);
  });

program
  .command("refine [iterations]")
  .description("Refine plan iteratively (default: 10)")
  .action(async (iterations: string | undefined) => {
    const options = makeOptions(program);
    const config = validateAgent(options.agent);
    checkAgentInstalled(config);
    const { runRefine, DEFAULT_REFINE_ITERATIONS } = await import("./commands/refine.js");
    const max =
      iterations && /^\d+$/.test(iterations)
        ? parseInt(iterations, 10)
        : DEFAULT_REFINE_ITERATIONS;
    const wt = options.worktree
      ? await setupWorktree("refine")
      : undefined;
    await runRefine(max, config, options, wt);
    worktreeDone = true;
  });

program
  .command("build [iterations]", { isDefault: true })
  .description("Execute plan (default: 10)")
  .action(async (iterations: string | undefined) => {
    const options = makeOptions(program);
    const config = validateAgent(options.agent);
    checkAgentInstalled(config);
    const max =
      iterations && /^\d+$/.test(iterations)
        ? parseInt(iterations, 10)
        : 10;
    const wt = options.worktree
      ? await setupWorktree("build")
      : undefined;
    const { runBuild, isSuccessStatus } = await import("./commands/build.js");
    const result = await runBuild(max, config, options, wt);
    worktreeDone = true;
    process.exit(isSuccessStatus(result.status) ? 0 : 1);
  });

program
  .command("review [target]")
  .description("Parallel code review with specialist agents")
  .option("-s, --staged", "Review staged changes only")
  .action(async (target: string | undefined, cmdOpts) => {
    const options = makeOptions(program);
    const config = validateAgent(options.agent);
    checkAgentInstalled(config);
    const { runReview } = await import("./commands/review.js");
    const { parseReviewTarget } = await import("./git.js");
    const reviewTarget = parseReviewTarget(
      [target].filter(Boolean) as string[],
      { staged: cmdOpts.staged ?? false },
    );
    const result = await runReview(config, options, reviewTarget);
    if (result.status !== "completed") process.exit(1);
  });

program
  .command("fix [instructions]")
  .description("Fix issues from code review")
  .action(async (instructions: string | undefined) => {
    const options = makeOptions(program);
    const config = validateAgent(options.agent);
    checkAgentInstalled(config);
    const { runFix } = await import("./commands/fix.js");
    const result = await runFix(instructions, config, options);
    if (result.status !== "completed") process.exit(1);
  });

program
  .command("yolo <task>")
  .description("Full autonomous pipeline: plan, refine, build, review, fix")
  .action(async (task: string) => {
    const options = makeOptions(program);
    const config = validateAgent(options.agent);
    checkAgentInstalled(config);
    const wt = options.worktree ? await setupWorktree("yolo") : undefined;
    const { runYolo } = await import("./commands/yolo.js");
    const result = await runYolo(task, config, options, wt);
    worktreeDone = true;
    if (result.status !== "completed") process.exit(1);
  });

program
  .command("update")
  .description("Update to latest version")
  .action(async () => {
    const { runUpdate } = await import("./commands/update.js");
    const result = await runUpdate();
    process.exit(result.exitCode);
  });

program
  .command("cleanup")
  .description("Remove ralph temp files")
  .action(async () => {
    const options = makeOptions(program);
    const { runCleanup } = await import("./commands/cleanup.js");
    await runCleanup({ force: options.force });
  });

program.exitOverride();

try {
  await program.parseAsync(process.argv);
} catch (err: unknown) {
  if (err instanceof Error && "code" in err) {
    const code = (err as { code: string }).code;
    if (
      code === "commander.helpDisplayed" ||
      code === "commander.version"
    ) {
      process.exit(0);
    }
  }
  if (err instanceof Error) {
    printError(err.message);
  }
  process.exit(1);
}
