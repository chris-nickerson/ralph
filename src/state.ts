import { readFile, writeFile } from "node:fs/promises";

const PLAN_FILE = "IMPLEMENTATION_PLAN.md";
const PROGRESS_FILE = "progress.txt";
const REVIEW_FILE = "REVIEW.md";

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
  await writeFile(REVIEW_FILE, "");
}

export async function saveReview(content: string): Promise<void> {
  await writeFile(REVIEW_FILE, content);
}

export async function loadReview(): Promise<string> {
  let content: string;
  try {
    content = await readFile(REVIEW_FILE, "utf-8");
  } catch (err: unknown) {
    const code = err instanceof Error && "code" in err ? (err as NodeJS.ErrnoException).code : undefined;
    if (code === "ENOENT") {
      throw new Error("no review found; run ralph review first");
    }
    throw err;
  }
  if (content.trim().length === 0) {
    throw new Error("no review found; run ralph review first");
  }
  return content;
}
