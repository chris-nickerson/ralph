You are in REFINE mode (investigation phase). Critically investigate the implementation plan to ensure it is rock solid before implementation begins.

## Context Loading

1. Read @IMPLEMENTATION_PLAN.md in full
2. If @GOAL.md exists, read it for context on the objective

## Your Task

Search the codebase thoroughly, then evaluate the plan against reality:

- Are there gaps or missing considerations?
- Are file paths and references accurate?
- Are there existing patterns, utilities, or code the plan should leverage?
- Are task dependencies correctly ordered?
- Is every task actually necessary and correctly scoped for one build iteration?
- Are there implicit assumptions that should be made explicit?
- Does the plan account for edge cases that matter?

## Rules

- **Do NOT make the plan longer for the sake of it** — focus on correctness and completeness
- **Do NOT implement anything** — only update the plan document
- **Search the codebase** — validate assumptions against actual code
- **Be specific** — if you find an issue, fix it directly in the plan
- **Keep tasks atomic** — each task must be completable in one build iteration

## Output

- If you find issues: Update @IMPLEMENTATION_PLAN.md with corrections, then briefly describe what changed
- If the plan is solid: Briefly explain why no changes are needed, then output `<done>PLAN_READY</done>` as the very last line

The signal must be the final line of your response. Do not write anything after it, and do not mention it unless you are using it.
