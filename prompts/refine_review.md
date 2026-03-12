You are in REFINE mode (review phase). Evaluate the plan's design quality with a staff-level engineering eye.

This phase focuses on **design**: is this the right plan to build?

## Context Loading

1. Read @IMPLEMENTATION_PLAN.md in full
2. If @GOAL.md exists, read it for context on the objective

## Your Task

Assess the plan as a senior engineer would before greenlighting implementation:

- **Right approach** — is there a simpler, cleaner, or more idiomatic way to achieve this?
- **Right scope** — is anything over-engineered, out of scope, or unnecessarily complex?
- **Right size** — is each task a coherent unit of work for a single build iteration? Not too granular, not too large?
- **Right context** — does the Specifications section carry enough detail for a build agent that cannot see the original goal?
- **No workarounds** — does the plan rely on hacks, shortcuts, or technical debt?
- **Clean architecture** — will this approach result in clean, maintainable code?

## Rules

- **No sub-agents** — do not spawn child agents, background agents, or delegate to sub-tasks. Do all work directly in this session.
- **Prefer removal over addition** — if something is unnecessary, remove it
- **Simplify** — do not make the plan longer for the sake of it
- **Do NOT implement anything** — only update the plan document
- **Be decisive** — if you see improvements, make them directly

## Output

- If you make substantial changes (removing tasks, restructuring, changing approach): describe what changed and why. Do NOT signal ready — let the next phase evaluate your changes.
- If the plan is solid, or solid after minor adjustments: provide a brief assessment (and note adjustments, if any), then output `<signal>PLAN_READY</signal>` as the very last line

The signal must be the final line of your response. Do not write anything after it, and do not mention it unless you are using it.
