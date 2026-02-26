import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { killAgent, validateAgent, checkAgentInstalled } from "./agent.js";
import type { RalphOptions } from "./agent.js";
import { createWorktree, getRepoRoot } from "./git.js";
import type { WorktreeInfo } from "./git.js";
import { dim, printError, printWarning } from "./ui.js";

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
  .option("--no-review", "Skip review phases (build only, no code review)")
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
    await runPlan(goal, config, options, wt);
    worktreeDone = true;
  });

program
  .command("refine [iterations]")
  .description("Refine plan iteratively (default: 10)")
  .action(async (iterations: string | undefined) => {
    const options = makeOptions(program);
    const config = validateAgent(options.agent);
    checkAgentInstalled(config);
    const max =
      iterations && /^\d+$/.test(iterations)
        ? parseInt(iterations, 10)
        : 10;
    const wt = options.worktree
      ? await setupWorktree("refine")
      : undefined;
    const { runRefine } = await import("./commands/refine.js");
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
    const { runBuild } = await import("./commands/build.js");
    await runBuild(max, config, options, wt);
    worktreeDone = true;
  });

program
  .command("update")
  .description("Update to latest version")
  .action(async () => {
    const { runUpdate } = await import("./commands/update.js");
    await runUpdate();
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
