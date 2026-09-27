import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RunState } from "./store.js";

const here = dirname(fileURLToPath(import.meta.url));
export const workflowFile = join(here, "..", "workflow", "WORKFLOW.md");

export async function makeInitialPrompt(run: RunState): Promise<string> {
  const workflow = await readFile(workflowFile, "utf8");
  return `You are Ralph's Codex orchestrator. Follow the complete workflow below. It is the operating contract for this run. The workflow directory is ${dirname(workflowFile)}; read sibling reference files there at their phases. Invoke Claude only through ${process.execPath} ${process.argv[1]} partner and fresh reviewers through ${process.execPath} ${process.argv[1]} reviewer so their calls are restricted and recorded.\n\n${workflow}\n\n## This run\n- Task: ${run.task}\n- Repository: ${run.repo}\n- Run directory: ${run.dir}\n- Mode: ${run.mode}\n- Keep PR draft: ${run.keepDraft}\n\nStart by inspecting the repository, applicable instructions, existing branch/PR, and task evidence. Save workflow-state.md and phase artifacts in the run directory as you go. The Ralph CLI's run.json is managed by the CLI; do not edit it. Complete every applicable phase and give a final evidence-backed report. If blocked, record the exact blocker and next action instead of claiming completion.`;
}

export function makeResumePrompt(run: RunState, instruction?: string): string {
  return `Resume Ralph run ${run.id} in ${run.repo}. Re-read ${workflowFile} and ${run.dir}/workflow-state.md, then reconcile current git, processes, PR, and external-write receipts before acting. ${run.codexSessionId ? "Continue this Codex session." : "The previous Codex launch produced no session ID; this is a new session for the same run. Reconcile saved evidence before any action."} Invoke Claude only through ${process.execPath} ${process.argv[1]} partner and fresh reviewers through ${process.execPath} ${process.argv[1]} reviewer. Preserve prior budgets and do not repeat uncertain writes. The run mode remains ${run.mode} and keep-draft remains ${run.keepDraft}. ${instruction ? `Additional user direction: ${instruction}` : "Continue applicable phases to completion."} Report evidence and remaining actions. Do not edit run.json.`;
}
