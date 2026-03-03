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
  secondsSince,
  printHeader,
  printKv,
  printPhase,
  printComplete,
  printTimingSummary,
  printLimitReached,
  printWorktreeNext,
  printError,
  printWarning,
} from "../ui.js";
import { runReviewPipeline } from "./review.js";

export interface BuildResult {
  status: "completed" | "limit_reached" | "no_tasks" | "no_plan" | "no_head" | "agent_failed";
  iterations: number;
}

export function isSuccessStatus(status: BuildResult["status"]): boolean {
  return status === "completed" || status === "limit_reached" || status === "no_tasks";
}

const SCRIPT_NAME = "ralph";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runBuild(
  maxIterations: number,
  config: AgentConfig,
  options: RalphOptions,
  worktreeInfo?: WorktreeInfo,
): Promise<BuildResult> {
  if (!(await hasContent("IMPLEMENTATION_PLAN.md"))) {
    printError("no implementation plan found");
    console.log("");
    console.log(`  ${dim("Create a plan first:")}`);
    console.log(`  ${SCRIPT_NAME} plan "your goal"`);
    console.log("");
    return { status: "no_plan", iterations: 0 };
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
    return { status: "no_tasks", iterations: 0 };
  }

  const startHash = await getHeadHash();
  if (!startHash) {
    printError("unable to resolve HEAD — is this a valid git repository?");
    return { status: "no_head", iterations: 0 };
  }
  const startTime = Date.now();
  let iteration = 0;
  let consecutiveFailures = 0;

  while (true) {
    iteration++;

    if (iteration > maxIterations) {
      const elapsed = secondsSince(startTime);
      printLimitReached(maxIterations, SCRIPT_NAME, "build", !!worktreeInfo, elapsed);
      if (worktreeInfo) {
        printWorktreeNext("resume", worktreeInfo, SCRIPT_NAME, "build");
      }
      return { status: "limit_reached", iterations: iteration - 1 };
    }

    const iterStart = Date.now();

    const elapsed = secondsSince(startTime);

    taskCount = await countTasks();
    const taskWord = taskCount === 1 ? "task" : "tasks";
    printPhase(iteration, "build", `${taskCount} ${taskWord} remaining`, elapsed);

    const buildPrompt = await buildBuildPrompt(options.noReview, options.noCommit);
    const { exitCode } = await runAgent(buildPrompt, config, options, "building");

    if (exitCode !== 0) {
      consecutiveFailures++;
      if (consecutiveFailures >= 3) {
        printError("agent failed 3 times consecutively; stopping");
        return { status: "agent_failed", iterations: iteration };
      }
      await sleep(1000);
      continue;
    }
    consecutiveFailures = 0;

    if (!options.noReview) {
      printPhase(iteration, "review", undefined, secondsSince(startTime));

      const reviewPrompt = await buildReviewPrompt(options.noCommit);
      await runAgent(reviewPrompt, config, options, "reviewing");
    }

    const iterElapsed = secondsSince(iterStart);
    console.log("");
    printTimingSummary(iterElapsed, secondsSince(startTime));

    taskCount = await countTasks();
    if (taskCount === 0) {
      if (!options.noReview) {
        printPhase(iteration, "final review", undefined, secondsSince(startTime));

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

        if (reviewContent === undefined) {
          printWarning("all reviewers failed — skipping review");
        } else {
          await saveReview(reviewContent);

          if (needsRevision) {
            printPhase(iteration, "fix", undefined, secondsSince(startTime));
            const fixPrompt = await buildFixPrompt(reviewContent, undefined, options.noCommit);
            await runAgent(fixPrompt, config, options, "fixing");
          }
        }
      }

      const totalSeconds = secondsSince(startTime);
      printComplete(iteration, totalSeconds);
      if (worktreeInfo) {
        printWorktreeNext("merge", worktreeInfo, SCRIPT_NAME, "build");
      }
      return { status: "completed", iterations: iteration };
    }

    await sleep(1000);
  }
}
