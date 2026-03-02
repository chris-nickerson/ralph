import { runAgent } from "../agent.js";
import type { AgentConfig, RalphOptions } from "../agent.js";
import type { WorktreeInfo } from "../git.js";
import { runRefine, DEFAULT_REFINE_ITERATIONS } from "./refine.js";
import { buildPlanPrompt } from "../prompt.js";
import { hasContent, countTasks, clearStateFiles, GOAL_FILE } from "../state.js";
import {
  dim,
  green,
  SYM_DOT,
  SYM_CHECK,
  SYM_BULLET,
  line,
  formatDuration,
  printHeader,
  printKv,
  printWarning,
  printError,
  printWorktreeNext,
  confirm,
} from "../ui.js";

const SCRIPT_NAME = "ralph";

export interface PlanResult {
  status: "created" | "cancelled" | "failed";
  taskCount: number;
}

export async function runPlan(
  goal: string | undefined,
  config: AgentConfig,
  options: RalphOptions,
  worktreeInfo?: WorktreeInfo,
): Promise<PlanResult> {
  const hasPlan = await hasContent("IMPLEMENTATION_PLAN.md");
  const hasProgress = await hasContent("progress.txt");

  if (hasPlan || hasProgress) {
    printWarning("existing state will be cleared:");
    if (hasPlan) console.log(`    ${dim(SYM_BULLET)} IMPLEMENTATION_PLAN.md`);
    if (hasProgress) console.log(`    ${dim(SYM_BULLET)} progress.txt`);
    console.log("");

    const ok = await confirm("Continue?", "n", options.force);
    if (!ok) {
      console.log(`${dim("Cancelled.")}`);
      return { status: "cancelled", taskCount: 0 };
    }
  }

  await clearStateFiles();

  let goalDisplay: string;
  if (goal) {
    goalDisplay = goal.length > 50 ? goal.slice(0, 50) + "..." : goal;
  } else if (await hasContent(GOAL_FILE)) {
    goalDisplay = `${dim("from")} ${GOAL_FILE}`;
  } else {
    goalDisplay = `${dim("audit mode")}`;
  }

  printHeader("planning");
  console.log("");
  printKv("agent", options.agent);
  if (worktreeInfo) {
    printKv("branch", worktreeInfo.branch);
    printKv("path", `../${worktreeInfo.name}`);
  }
  printKv("goal", goalDisplay);
  console.log("");

  const startTime = Date.now();
  const prompt = await buildPlanPrompt(goal);

  await runAgent(prompt, config, options, "planning");

  const elapsed = Math.floor((Date.now() - startTime) / 1000);

  if (!(await hasContent("IMPLEMENTATION_PLAN.md"))) {
    printError("agent did not create a plan");
    return { status: "failed", taskCount: 0 };
  }

  const taskCount = await countTasks();
  const taskWord = taskCount === 1 ? "task" : "tasks";

  console.log("");
  console.log(dim(line()));
  console.log(
    `  ${green(SYM_CHECK)} ${dim(SYM_DOT)} plan created ${dim(SYM_DOT)} ${taskCount} ${taskWord} ${dim(SYM_DOT)} ${formatDuration(elapsed)}`,
  );
  console.log(dim(line()));
  console.log("");

  if (!options.noRefine) {
    await runRefine(DEFAULT_REFINE_ITERATIONS, config, options, worktreeInfo);
    return { status: "created", taskCount };
  }

  if (worktreeInfo) {
    printWorktreeNext("build", worktreeInfo, SCRIPT_NAME, "plan");
  } else {
    console.log(`  ${dim("Review:")}  cat IMPLEMENTATION_PLAN.md`);
    console.log(`  ${dim("Build:")}   ${SCRIPT_NAME} build`);
    console.log("");
  }

  return { status: "created", taskCount };
}
