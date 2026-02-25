import { readFile, writeFile } from "node:fs/promises";

const PLAN_FILE = "IMPLEMENTATION_PLAN.md";
const PROGRESS_FILE = "progress.txt";

export async function hasContent(filePath: string): Promise<boolean> {
  try {
    const data = await readFile(filePath, "utf-8");
    return data.trim().length > 0;
  } catch {
    return false;
  }
}

export async function countTasks(): Promise<number> {
  try {
    const data = await readFile(PLAN_FILE, "utf-8");
    const lines = data.split("\n");
    return lines.filter((l) => /^- \[ \]/.test(l)).length;
  } catch {
    return 0;
  }
}

export async function clearStateFiles(): Promise<void> {
  await writeFile(PLAN_FILE, "");
  await writeFile(PROGRESS_FILE, "");
}
