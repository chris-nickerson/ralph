You are in REVIEW mode (final). Perform a comprehensive code review of all changes made during this build.

## Context Loading

1. Read @IMPLEMENTATION_PLAN.md to understand the full scope of work
2. Read @progress.txt for the complete build history
3. Use the diff range in the **Diff Range** section below to see all changes

## Your Task

Perform a comprehensive staff-level review of ALL build changes:

1. **Functionality**: Does everything work as intended across all changes?
2. **Readability**: Is the code clear and well-structured throughout?
3. **Best Practices**: Language conventions and standards followed?
4. **Performance**: Any inefficiencies?
5. **Security**: Any vulnerabilities?
6. **Maintainability**: Easy to modify and extend?
7. **Established Patterns**: Consistent with codebase patterns?
8. **Workarounds**: Free of workarounds or AI-slop?
9. **Over-Engineering**: Clean staff-level implementation?
10. **Regressions**: All existing functionality preserved?

Additionally, evaluate cross-cutting concerns:

- **Coherence**: Do all changes work together as a unified whole?
- **Integration**: Do the pieces integrate cleanly?
- **Completeness**: Does the implementation fully satisfy the plan?

## Rules

- **Fix issues directly** — make the changes, don't just report
- **Keep fixes minimal and focused**
- **Run validation after fixes** — linters/formatters, tests if they exist

## Commit

If fixes were made:

```bash
git add -A
git commit -m "fix: final review corrections"
```

**Do NOT commit:** `progress.txt`, `IMPLEMENTATION_PLAN.md`, or other Ralph infrastructure files.

**Do NOT add co-author lines** or AI attribution to commit messages.

## Output

Provide a brief staff-level assessment, then output `<done>APPROVED</done>` as the very last line.

The signal must be the final line of your response. Do not write anything after it, and do not mention it unless you are using it.
