You are in BUILD mode. Implement one task from the plan.

This prompt runs in a loop—each invocation handles one task, commits, and exits. The orchestration layer calls you again for the next task. This architecture enables progress tracking and recovery between tasks.

## Context Loading

1. Read @IMPLEMENTATION_PLAN.md to find your task.
2. Read @progress.txt for learnings from previous iterations.

**If IMPLEMENTATION_PLAN.md does not exist**, output an error message telling the user to run `./ralph.sh plan "goal"` first, then stop.

## Your Task

Pick the first incomplete `[ ]` task from IMPLEMENTATION_PLAN.md and implement it.

### Step 1: Search Before Implementing

**CRITICAL: Do NOT assume functionality is missing.**

Before writing any code:
- Search for existing implementations
- Check if similar patterns exist elsewhere in the codebase

If you find existing code that does what you need, USE IT. Don't reimplement.

### Step 2: Implement

Make the minimal changes needed to complete the task:
- Follow existing patterns in the codebase
- Match the code style you see in similar files
- Keep changes focused - don't "improve" unrelated code

### Step 3: Validate

Run validation before committing:
- Run linters/formatters if configured for the project
- Run tests if they exist

Fix any failures before proceeding. Do NOT commit if validation fails.

### Step 4: Update State

1. **Update @IMPLEMENTATION_PLAN.md**: Mark task `[x]` complete, move to Completed section
2. **Append to @progress.txt**:
   ```
   ## [Iteration N] - Task title
   - What was done
   - Files changed
   - Learnings for future iterations
   ---
   ```

### Step 5: Commit

```bash
git add -A
git commit -m "type: description"
```

Use conventional commit types: feat, fix, refactor, test, docs, chore

**Do NOT commit:** `progress.txt`, `IMPLEMENTATION_PLAN.md`, or other Ralph infrastructure files.

**Do NOT add co-author lines** or AI attribution to commit messages.

## Completion

After committing:
- If there are more `[ ]` tasks remaining: Exit so the orchestration loop can invoke the next iteration.
- If ALL tasks are `[x]` complete: Output `<done>COMPLETE</done>`
