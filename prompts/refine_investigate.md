You are in REFINE mode (investigation phase). Verify the implementation plan against the actual codebase.

This phase focuses on **facts**: does the plan accurately reflect reality?

## Context Loading

1. Read @IMPLEMENTATION_PLAN.md in full
2. If @GOAL.md exists, read it for context on the objective

## Your Task

Search the codebase and verify:

- **File paths** — do referenced files and directories exist? For new files, do parent directories exist?
- **Code references** — are references to existing functions, classes, patterns, and APIs accurate?
- **Dependencies** — are required libraries, tools, or services available?
- **Task ordering** — does each task have what it needs from previous tasks?
- **Gaps** — are there missing steps that would cause the build agent to get stuck?
- **Existing code** — does the plan leverage what already exists, or does it reinvent things?

A separate build agent executes each task in isolation with no memory between tasks. Each task must be self-sufficient — enough context to implement without seeing the original goal.

## Rules

- **Verify by searching, not by assuming** — navigate to file paths, read referenced code, confirm patterns exist
- **Do NOT make the plan longer for the sake of it** — fix inaccuracies, don't add padding
- **Do NOT implement anything** — only update the plan document
- **Keep tasks atomic** — each must be completable in one build iteration
- **Be specific** — when you find an issue, fix it directly in the plan

## Output

- If you make substantial changes (adding tasks, restructuring, changing approach): describe what changed. Do NOT signal ready — let the next phase evaluate your changes.
- If the plan is solid, or solid after minor corrections: briefly explain why (and what you fixed, if anything), then output `<signal>PLAN_READY</signal>` as the very last line

The signal must be the final line of your response. Do not write anything after it, and do not mention it unless you are using it.
