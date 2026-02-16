You are in PLANNING mode. Create an implementation plan for the goal below.

## Your Task

Read the **Goal** section at the bottom of this prompt, then:

1. **Search the codebase thoroughly** before assuming anything is missing.

2. **Break down the goal** into small, atomic tasks:
   - Each task should be completable in ONE build iteration
   - Include specific file paths where work is needed
   - Order by dependency (foundation first, then features, then polish)

3. **Write the plan to IMPLEMENTATION_PLAN.md** using the Write tool:

```markdown
# Implementation Plan

Goal: [one-line summary]

## Specifications
[Key details from the goal - omit section if none]

## Tasks
- [ ] Task 1: Description (files: path/to/file.ts)
- [ ] Task 2: Description (files: path/to/file.ts)

## Completed
- [x] Completed tasks moved here
```

## Rules

- **PLAN ONLY** - Do NOT implement anything
- **Search first** - Never assume code doesn't exist
- **One task = one build iteration** - Keep tasks small and focused
- **Be specific** - Include file paths where work is needed
- **No verification tasks** - Lint, format, and tests are assumed after each task. Include feature-specific acceptance criteria in Specifications, not as a separate task.
- **Self-sufficient plan** - The implementing agent will NOT see the original goal. Include everything they need to implement correctly—requirements, context, and references. Omit what doesn't inform implementation.
