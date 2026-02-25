import type { RalphOptions } from "../agent.js";
import type { WorktreeInfo } from "../git.js";

export async function runPlan(
  _goal: string | undefined,
  _options: RalphOptions,
  _worktreeInfo?: WorktreeInfo,
): Promise<void> {
  throw new Error("plan command not yet implemented");
}
