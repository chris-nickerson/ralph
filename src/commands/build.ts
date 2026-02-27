import { runAgent } from "../agent.js";
import type { AgentConfig, RalphOptions } from "../agent.js";
import type { WorktreeInfo } from "../git.js";
import { getHeadHash, getCurrentBranch, getDiffStat, getCommitLog } from "../git.js";
import { buildBuildPrompt, buildReviewPrompt, buildFixPrompt } from "../prompt.js";
import type { CodeReviewContext } from "../prompt.js";
import { hasContent, countTasks, saveReview } from "../state.js";
import {
  dim,
  green,
  SYM_CHECK,
  line,
  formatDuration,
  printHeader,
  printKv,
  printPhase,
  printComplete,
  printLimitReached,
  printWorktreeNext,
  printError,
} from "../ui.js";
import { runReviewPipeline } from "./review.js";

const SCRIPT_NAME = "ralph";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runBuild(
  maxIterations: number,
  config: AgentConfig,
  options: RalphOptions,
  worktreeInfo?: WorktreeInfo,
): Promise<void> {
  if (!(await hasContent("IMPLEMENTATION_PLAN.md"))) {
    printError("no implementation plan found");
    console.log("");
    console.log(`  ${dim("Create a plan first:")}`);
    console.log(`  ${SCRIPT_NAME} plan "your goal"`);
    console.log("");
    process.exit(1);
  }

  let taskCount = await countTasks();

  printHeader("building");
  console.log("");
  printKv("agent", options.agent);
  if (worktreeInfo) {
    printKv("branch", worktreeInfo.branch);
    printKv("path", `../${worktreeInfo.name}`);
  }
  printKv("tasks", `${taskCount} remaining`);
  printKv("limit", `${maxIterations} iterations`);
  if (options.noReview) printKv("review", "off");
  if (options.noCommit) printKv("commit", "off");

  if (taskCount === 0) {
    console.log("");
    console.log(dim(line()));
    console.log(`  ${green(SYM_CHECK)} all tasks complete`);
    console.log(dim(line()));
    console.log("");
    if (worktreeInfo) {
      printWorktreeNext("merge", worktreeInfo, SCRIPT_NAME, "build");
    }
    process.exit(0);
  }

  const startHash = await getHeadHash();
  const startTime = Date.now();
  let iteration = 0;
  let consecutiveFailures = 0;

  while (true) {
    iteration++;

    if (iteration > maxIterations) {
      printLimitReached(maxIterations, SCRIPT_NAME, "build", !!worktreeInfo);
      if (worktreeInfo) {
        printWorktreeNext("resume", worktreeInfo, SCRIPT_NAME, "build");
      }
      process.exit(0);
    }

    const iterStart = Date.now();

    taskCount = await countTasks();
    const taskWord = taskCount === 1 ? "task" : "tasks";
    printPhase(iteration, "build", `${taskCount} ${taskWord} remaining`);

    const buildPrompt = await buildBuildPrompt(options.noReview, options.noCommit);
    const { exitCode } = await runAgent(buildPrompt, config, options, "building", startTime);

    if (exitCode !== 0) {
      consecutiveFailures++;
      if (consecutiveFailures >= 3) {
        printError("agent failed 3 times consecutively; stopping");
        process.exit(1);
      }
      await sleep(1000);
      continue;
    }
    consecutiveFailures = 0;

    if (!options.noReview) {
      printPhase(iteration, "review");

      const reviewPrompt = await buildReviewPrompt(options.noCommit);
      await runAgent(reviewPrompt, config, options, "reviewing", startTime);
    }

    const iterElapsed = Math.floor((Date.now() - iterStart) / 1000);
    console.log("");
    console.log(`${dim(`  iteration elapsed: ${formatDuration(iterElapsed)}`)}`);

    taskCount = await countTasks();
    if (taskCount === 0) {
      if (!options.noReview) {
        printPhase(iteration, "final review");

        const range = options.noCommit ? startHash : `${startHash}..HEAD`;
        const context: CodeReviewContext = {
          diffCmd: `git diff ${range}`,
          scope: "branch",
          diffStat: await getDiffStat(range),
          commitLog: options.noCommit ? "" : await getCommitLog(range),
          branch: await getCurrentBranch(),
          description: `build (${iteration} iterations)`,
        };

        const { reviewContent, needsRevision } = await runReviewPipeline(context, config, options, startTime);

        if (reviewContent !== undefined) {
          await saveReview(reviewContent);
        }

        if (needsRevision && reviewContent !== undefined) {
          printPhase(iteration, "fix");
          const fixPrompt = await buildFixPrompt(reviewContent, undefined, options.noCommit);
          await runAgent(fixPrompt, config, options, "fixing", startTime);
        }
      }

      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      printComplete(iteration, formatDuration(elapsed));
      if (worktreeInfo) {
        printWorktreeNext("merge", worktreeInfo, SCRIPT_NAME, "build");
      }
      process.exit(0);
    }

    await sleep(1000);
  }
}
