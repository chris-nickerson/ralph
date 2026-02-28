import { runAgent } from "../agent.js";
import type { AgentConfig, RalphOptions } from "../agent.js";
import type { WorktreeInfo } from "../git.js";
import { buildPlanPrompt } from "../prompt.js";
import { clearStateFiles, hasContent, countTasks } from "../state.js";
import { runRefine, DEFAULT_REFINE_ITERATIONS } from "./refine.js";
import { runBuild } from "./build.js";
import type { BuildResult } from "./build.js";
import {
  dim,
  printHeader,
  printKv,
  printError,
} from "../ui.js";

export async function runYolo(
  goal: string,
  config: AgentConfig,
  options: RalphOptions,
  worktreeInfo?: WorktreeInfo,
): Promise<void> {
  options = { ...options, force: true };

  const goalDisplay = goal.length > 50 ? goal.slice(0, 50) + "..." : goal;

  printHeader("yolo");
  console.log("");
  printKv("agent", options.agent);
  printKv("goal", goalDisplay);
  if (worktreeInfo) {
    printKv("branch", worktreeInfo.branch);
    printKv("path", `../${worktreeInfo.name}`);
  }

  const phases = options.noRefine
    ? "plan → build → review"
    : "plan → refine → build → review";
  printKv("phases", phases);

  // Plan phase
  await clearStateFiles();

  const startTime = Date.now();
  const prompt = await buildPlanPrompt(goal);
  await runAgent(prompt, config, options, "planning", startTime);

  if (!(await hasContent("IMPLEMENTATION_PLAN.md"))) {
    printError("agent did not create a plan");
    process.exit(1);
  }

  const taskCount = await countTasks();
  const taskWord = taskCount === 1 ? "task" : "tasks";
  console.log(`  ${dim(`plan created: ${taskCount} ${taskWord}`)}`);

  // Refine phase
  if (!options.noRefine) {
    await runRefine(DEFAULT_REFINE_ITERATIONS, config, options, worktreeInfo);
  }

  // Build phase
  const result: BuildResult = await runBuild(10, config, options, worktreeInfo);

  if (result.status === "agent_failed" || result.status === "no_plan" || result.status === "no_head") {
    process.exit(1);
  }
}
