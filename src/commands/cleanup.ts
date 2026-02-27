import { access } from "node:fs/promises";
import { CLEANUP_FILES, deleteStateFiles } from "../state.js";
import {
  dim,
  green,
  SYM_BULLET,
  printWarning,
  confirm,
} from "../ui.js";

export async function runCleanup(options: {
  force: boolean;
}): Promise<void> {
  const existing: string[] = [];
  for (const file of CLEANUP_FILES) {
    const exists = await access(file).then(
      () => true,
      () => false,
    );
    if (exists) existing.push(file);
  }

  if (existing.length === 0) {
    console.log(dim("nothing to clean up"));
    return;
  }

  printWarning("the following files will be deleted:");
  for (const file of existing) {
    console.log(`    ${dim(SYM_BULLET)} ${file}`);
  }
  console.log("");

  const ok = await confirm("Continue?", "n", options.force);
  if (!ok) {
    console.log(dim("Cancelled."));
    return;
  }

  const deleted = await deleteStateFiles(existing);
  console.log("");
  console.log(
    green("deleted:") +
      " " +
      deleted.map((f) => dim(f)).join(", "),
  );
}
