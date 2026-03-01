import type { AgentConfig, RalphOptions } from "../agent.js";
import type { WorktreeInfo } from "../git.js";
import { runPlan } from "./plan.js";
import { runRefine, DEFAULT_REFINE_ITERATIONS } from "./refine.js";
import { runBuild, isSuccessStatus } from "./build.js";
import type { BuildResult } from "./build.js";
import {
  dim,
  printHeader,
  printKv,
} from "../ui.js";

export interface YoloResult {
  status: "completed" | "plan_failed" | "build_failed";
}

export async function runYolo(
  goal: string,
  config: AgentConfig,
  options: RalphOptions,
  worktreeInfo?: WorktreeInfo,
): Promise<YoloResult> {
  const skipRefine = options.noRefine;
  options = { ...options, force: true, noRefine: true };

  const goalDisplay = goal.length > 50 ? goal.slice(0, 50) + "..." : goal;

  printHeader("yolo");
  console.log("");
  printKv("agent", options.agent);
  printKv("goal", goalDisplay);
  if (worktreeInfo) {
    printKv("branch", worktreeInfo.branch);
    printKv("path", `../${worktreeInfo.name}`);
  }

  const phases = skipRefine
    ? "plan → build → review"
    : "plan → refine → build → review";
  printKv("phases", phases);

  const planResult = await runPlan(goal, config, options, worktreeInfo);
  if (planResult.status !== "created") {
    return { status: "plan_failed" };
  }

  const taskWord = planResult.taskCount === 1 ? "task" : "tasks";
  console.log(`  ${dim(`plan created: ${planResult.taskCount} ${taskWord}`)}`);

  if (!skipRefine) {
    await runRefine(DEFAULT_REFINE_ITERATIONS, config, options, worktreeInfo);
  }

  const result: BuildResult = await runBuild(10, config, options, worktreeInfo);

  if (!isSuccessStatus(result.status)) {
    return { status: "build_failed" };
  }
  return { status: "completed" };
}
