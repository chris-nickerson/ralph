You are in REFINE mode (review phase). Evaluate this implementation plan with an objective staff-level engineering eye.

## Context Loading

1. Read @IMPLEMENTATION_PLAN.md in full
2. If @GOAL.md exists, read it for context on the objective

## Your Task

Perform a staff-level assessment of the plan:

- **Clean & maintainable** — Will this approach result in clean, maintainable code?
- **Appropriately scoped** — Is anything over-engineered or out of scope?
- **No workarounds** — Does the plan rely on hacks or workarounds?
- **Architecturally sound** — Is it free of technical debt by design?
- **Optimal approach** — Is there a cleaner, more appropriate, or objectively better approach?
- **Task quality** — Are tasks atomic, correctly ordered, and properly scoped for single iterations?

## Rules

- **Do NOT make the plan longer for the sake of it** — simplify where possible
- **Do NOT implement anything** — only update the plan document
- **Prefer removal over addition** — if something is unnecessary, remove it
- **Be decisive** — if you recommend changes, make them directly in the plan

## Output

- If improvements are needed: Update @IMPLEMENTATION_PLAN.md with your changes, then briefly describe what changed and why
- If the plan is solid: Provide a brief staff-level assessment confirming readiness, then output `<done>PLAN_READY</done>` as the very last line

The signal must be the final line of your response. Do not write anything after it, and do not mention it unless you are using it.
