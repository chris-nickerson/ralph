import { runAgent } from "../agent.js";
import type { AgentConfig, RalphOptions } from "../agent.js";
import type { WorktreeInfo } from "../git.js";
import { loadRefinePrompt } from "../prompt.js";
import { parseSignal } from "../signal.js";
import { hasContent, countTasks } from "../state.js";
import {
  dim,
  green,
  SYM_CHECK,
  SYM_DOT,
  line,
  formatDuration,
  printHeader,
  printKv,
  printPhase,
  printTimingSummary,
  printLimitReached,
  printWorktreeNext,
  printError,
} from "../ui.js";

const SCRIPT_NAME = "ralph";

export const DEFAULT_REFINE_ITERATIONS = 10;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RefineResult {
  done: boolean;
  iterations: number;
}

export async function runRefine(
  maxIterations: number,
  config: AgentConfig,
  options: RalphOptions,
  worktreeInfo?: WorktreeInfo,
): Promise<RefineResult> {
  if (!(await hasContent("IMPLEMENTATION_PLAN.md"))) {
    printError("no implementation plan found");
    console.log("");
    console.log(`  ${dim("Create a plan first:")}`);
    console.log(`  ${SCRIPT_NAME} plan "your goal"`);
    console.log("");
    return { done: false, iterations: 0 };
  }

  const taskCount = await countTasks();

  printHeader("refining");
  console.log("");
  printKv("agent", options.agent);
  if (worktreeInfo) {
    printKv("branch", worktreeInfo.branch);
    printKv("path", `../${worktreeInfo.name}`);
  }
  printKv("tasks", `${taskCount} in plan`);
  printKv("limit", `${maxIterations} iterations`);

  const startTime = Date.now();
  let iteration = 0;
  let consecutiveReady = 0;
  let consecutiveFailures = 0;
  let phase: "investigate" | "review" = "investigate";

  while (true) {
    iteration++;

    if (iteration > maxIterations) {
      const elapsed = formatDuration(Math.floor((Date.now() - startTime) / 1000));
      printLimitReached(maxIterations, SCRIPT_NAME, "refine", !!worktreeInfo, elapsed);
      if (worktreeInfo) {
        printWorktreeNext("resume", worktreeInfo, SCRIPT_NAME, "refine");
      }
      return { done: false, iterations: iteration - 1 };
    }

    printPhase(iteration, phase, undefined, formatDuration(Math.floor((Date.now() - startTime) / 1000)));

    const iterStart = Date.now();
    const prompt = await loadRefinePrompt(phase);
    const { output, exitCode } = await runAgent(
      prompt,
      config,
      options,
      phase,
    );

    const iterElapsed = Math.floor((Date.now() - iterStart) / 1000);
    console.log("");
    printTimingSummary(iterElapsed, Math.floor((Date.now() - startTime) / 1000));

    if (exitCode !== 0) {
      consecutiveFailures++;
      consecutiveReady = 0;
      if (consecutiveFailures >= 3) {
        printError("agent failed 3 times consecutively; stopping");
        return { done: false, iterations: iteration };
      }
      phase = phase === "investigate" ? "review" : "investigate";
      await sleep(1000);
      continue;
    }
    consecutiveFailures = 0;

    if (parseSignal(output) === "PLAN_READY") {
      consecutiveReady++;
      console.log(
        `  ${dim(`${phase}: plan is ready (${consecutiveReady}/2)`)}`,
      );

      if (consecutiveReady >= 2) {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const iterWord = iteration === 1 ? "iteration" : "iterations";

        console.log("");
        console.log(dim(line()));
        console.log(
          `  ${green(SYM_CHECK)} ${dim(SYM_DOT)} plan ready ${dim(SYM_DOT)} ${iteration} ${iterWord} ${dim(SYM_DOT)} ${formatDuration(elapsed)}`,
        );
        console.log(dim(line()));
        console.log("");
        if (worktreeInfo) {
          printWorktreeNext("build", worktreeInfo, SCRIPT_NAME, "refine");
        } else {
          console.log(`  ${dim("Review:")}  cat IMPLEMENTATION_PLAN.md`);
          console.log(`  ${dim("Build:")}   ${SCRIPT_NAME} build`);
          console.log("");
        }
        return { done: true, iterations: iteration };
      }
    } else {
      consecutiveReady = 0;
    }

    phase = phase === "investigate" ? "review" : "investigate";

    await sleep(1000);
  }
}
