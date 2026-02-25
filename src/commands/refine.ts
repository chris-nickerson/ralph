import { validateAgent, runAgent } from "../agent.js";
import type { RalphOptions } from "../agent.js";
import type { WorktreeInfo } from "../git.js";
import { loadRefinePrompt } from "../prompt.js";
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
  printLimitReached,
  printWorktreeNext,
  printError,
} from "../ui.js";

const SCRIPT_NAME = "ralph";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runRefine(
  maxIterations: number,
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

  const config = validateAgent(options.agent);
  const startTime = Date.now();
  let iteration = 0;
  let consecutiveReady = 0;
  let phase: "investigate" | "review" = "investigate";

  while (true) {
    iteration++;

    if (iteration > maxIterations) {
      printLimitReached(maxIterations, SCRIPT_NAME, "refine", !!worktreeInfo);
      if (worktreeInfo) {
        printWorktreeNext("resume", worktreeInfo, SCRIPT_NAME, "refine");
      }
      process.exit(0);
    }

    printPhase(iteration, phase);

    const iterStart = Date.now();
    const prompt = await loadRefinePrompt(phase);
    const { output } = await runAgent(
      prompt,
      config,
      options,
      phase,
      startTime,
    );

    const iterElapsed = Math.floor((Date.now() - iterStart) / 1000);
    console.log("");
    console.log(`${dim(`  iteration elapsed: ${formatDuration(iterElapsed)}`)}`);

    const lastLines = output.split("\n").slice(-5).join("\n");
    if (lastLines.includes("<done>PLAN_READY</done>")) {
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
        process.exit(0);
      }
    } else {
      consecutiveReady = 0;
    }

    phase = phase === "investigate" ? "review" : "investigate";

    await sleep(1000);
  }
}
