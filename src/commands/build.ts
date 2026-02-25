import type { RalphOptions } from "../agent.js";
import type { WorktreeInfo } from "../git.js";

export async function runBuild(
  _maxIterations: number,
  _options: RalphOptions,
  _worktreeInfo?: WorktreeInfo,
): Promise<void> {
  throw new Error("build command not yet implemented");
}
