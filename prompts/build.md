You are in BUILD mode. Implement one task from the plan.

This runs in a loop — each invocation handles one task. Focus on correct, working code. Do not spawn sub-agents, child agents, or background agents — do all work directly in this session.

## Context Loading

1. Read @IMPLEMENTATION_PLAN.md — the first incomplete `[ ]` task is yours.
2. Read @progress.txt — apply relevant learnings from previous iterations.

**If IMPLEMENTATION_PLAN.md does not exist**, output an error and stop.

## Step 1: Understand and Search

Before writing any code:

1. Read the task and the plan's Specifications section to understand what you're building and why
2. If modifying existing files, read each file in full plus any files they import from
3. If creating new files, find and read a similar existing file to match its structure and patterns
4. Search for existing implementations of the key concepts — if code already does what you need, use it

## Step 2: Implement

Make the changes needed to complete the task:

- Follow existing patterns — match the structure, naming, and style of similar code in the project
- Stay in scope — only modify files and functions directly related to the task
- Do not add comments that narrate code
- Do not create abstractions for things used only once
- Do not add dependencies not already in the project unless the plan explicitly calls for them
- If something about the task is unclear or seems wrong, note the ambiguity in progress.txt and implement your best interpretation rather than guessing at something unrelated

## Step 3: Validate

- If the project has a test suite, run it. Fix failures.
- If linters or formatters are configured (check package.json scripts, Makefile, or config files), run them. Fix failures.

## Step 4: Update State

1. Mark your task `[x]` in @IMPLEMENTATION_PLAN.md and move it to the Completed section
2. Append to @progress.txt:
   ```
   ## Task: [title]
   - What was done
   - Key files changed
   - Anything the next iteration should know
   ---
   ```

## Step 5: Commit

After implementing and validating:

```bash
git add -A
git reset HEAD -- progress.txt IMPLEMENTATION_PLAN.md GOAL.md REVIEW.md 2>/dev/null || true
git commit -m "type: description"
```

Use conventional commit types: feat, fix, refactor, test, docs, chore. The message describes what was implemented.

Do NOT add co-author lines or AI attribution.
