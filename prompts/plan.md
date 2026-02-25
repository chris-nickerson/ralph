You are in PLANNING mode. Create an implementation plan for the goal below.

## Your Task

Read the **Goal** section at the bottom of this prompt, then:

1. **Search the codebase thoroughly** — read the project structure, key files, and existing patterns before planning. Never assume code doesn't exist.

2. **Break down the goal** into focused tasks:
   - Each task runs as a separate agent invocation with no memory of previous tasks
   - Include specific file paths where work is needed
   - Order by dependency: foundation first, then features, then integration

3. **Write the plan to IMPLEMENTATION_PLAN.md** using this format:

```markdown
# Implementation Plan

Goal: [one-line summary]

## Specifications
[Shared context for the build agent: requirements, API contracts, data structures, behavioral expectations, design decisions, patterns to follow. Omit only if the goal is trivial.]

## Tasks
- [ ] Task 1: Description (files: path/to/file.ts)
- [ ] Task 2: Description (files: path/to/file.ts)

## Completed
- [x] Completed tasks moved here
```

## Rules

- **PLAN ONLY** — do not implement anything
- **Self-sufficient plan** — a separate build agent implements tasks one at a time. It cannot see the original goal and has no memory between tasks. Each task description must say what to build and how it should behave, not just name it. Put shared context in Specifications; individual tasks reference it.
- **Right-sized tasks** — each task should be a coherent unit of work: one feature, one module, one meaningful change. Too granular (adding a single import) wastes iterations. Too large (building an entire subsystem) overwhelms a single invocation.
- **No verification tasks** — linting, formatting, and tests run after every task automatically. Put acceptance criteria in Specifications, not as separate tasks.
- **Be specific** — include file paths, function names, and references to existing code where it helps the build agent
