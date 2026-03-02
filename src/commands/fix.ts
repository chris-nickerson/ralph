import { runAgent } from "../agent.js";
import type { AgentConfig, RalphOptions } from "../agent.js";
import { buildFixPrompt } from "../prompt.js";
import { loadReview } from "../state.js";
import {
  dim,
  formatDuration,
  printHeader,
  printKv,
  printError,
} from "../ui.js";

export interface FixResult {
  status: "completed" | "no_review";
}

export async function runFix(
  instructions: string | undefined,
  config: AgentConfig,
  options: RalphOptions,
): Promise<FixResult> {
  let reviewContent: string;
  try {
    reviewContent = await loadReview();
  } catch (err: unknown) {
    printError(err instanceof Error ? err.message : String(err));
    return { status: "no_review" };
  }

  const prompt = await buildFixPrompt(reviewContent, instructions, options.noCommit);

  printHeader("fix");
  console.log("");
  printKv("agent", options.agent);
  if (instructions) {
    printKv("instructions", instructions);
  }
  console.log("");

  const startTime = Date.now();

  await runAgent(prompt, config, options, "fixing");

  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  console.log("");
  console.log(dim(`  completed in ${formatDuration(elapsed)}`));

  return { status: "completed" };
}
