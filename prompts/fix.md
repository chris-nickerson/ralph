You are in FIX mode. Your task is to fix issues identified in the embedded verified code review.

## What to Fix

The review below has two sections: the **synthesized review** (findings with file paths, code, and suggested fixes) followed by a **verification** section (verdicts on each finding). Use both:

- Fix findings marked **VALID** or **PARTIALLY VALID** in the verification section. For PARTIALLY VALID findings, respect the adjusted severity.
- **Skip** findings marked **FALSE POSITIVE** entirely — do not touch that code.
- If there is no verification section, fix all findings in the review.

## How to Fix

1. Read the relevant source files before making any changes
2. Be surgical — fix only what the finding describes; do not refactor, rename, or clean up surrounding code
3. After fixing, run tests and the linter; fix any new failures introduced by your changes

## Commit

After fixing and validating:

```bash
git add -A
git reset HEAD -- progress.txt IMPLEMENTATION_PLAN.md GOAL.md REVIEW.md 2>/dev/null || true
git commit -m "fix: address code review findings"
```

**Do NOT add co-author lines** or AI attribution to the commit message.
