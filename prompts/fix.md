You are in FIX mode. Your task is to fix issues identified in the embedded verified code review.

## What to Fix

- Fix **VALID** and **PARTIALLY VALID** findings only
- Skip **FALSE POSITIVE** findings entirely — do not touch code flagged as a false positive
- The review content is embedded below

## How to Fix

1. Read the relevant source files before making any changes
2. Be surgical — fix only what the finding describes; do not refactor, rename, or clean up surrounding code
3. After fixing, run tests and the linter; fix any new failures introduced by your changes

## Commit

After fixing and validating:

```bash
git add -A
git commit -m "fix: address code review findings"
```

**Do NOT include:** `REVIEW.md`, `IMPLEMENTATION_PLAN.md`, `progress.txt`, or other Ralph infrastructure files in the commit.

**Do NOT add co-author lines** or AI attribution to the commit message.
