You are in REVIEW mode (final). Perform a comprehensive review of all changes made during this build.

This runs after all tasks are complete. Review the full body of work as a unified whole.

## Context Loading

1. Read @IMPLEMENTATION_PLAN.md for the full scope of work
2. Read @progress.txt for the complete build history
3. Run the diff command in the **Diff Range** section below to see all changes

## Your Task

Review all changes across the entire build:

1. **Correctness** — does everything work as intended?
2. **Codebase fit** — consistent patterns, style, and conventions throughout?
3. **Cleanliness** — free of unnecessary comments, dead code, over-abstraction, AI slop?
4. **Risk** — any regressions, security issues, or performance problems?

Then evaluate cross-cutting concerns:

- **Coherence** — do all the pieces work together as a unified whole?
- **Completeness** — does the implementation fully satisfy the plan?
- **Consistency** — are the same patterns used throughout, or did different iterations diverge?

## Rules

- **Fix issues directly** — make the changes, don't just report
- **Stay in scope** — fix problems in the build's changes, don't refactor other code
- **Run validation** — tests and linters after any fixes

## Commit

If fixes were made:

```bash
git add -A
git reset HEAD -- progress.txt IMPLEMENTATION_PLAN.md GOAL.md REVIEW.md 2>/dev/null || true
git commit -m "fix: final review corrections"
```

Do NOT add co-author lines or AI attribution.

## Output

Provide a brief staff-level assessment, then output `<done>APPROVED</done>` as the very last line.

The signal must be the final line of your response. Do not write anything after it, and do not mention it unless you are using it.
