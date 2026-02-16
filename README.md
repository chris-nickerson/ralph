# Ralph

Autonomous coding loop that plans and implements features iteratively using AI agents.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/chris-nickerson/ralph/main/install.sh | bash
```

This installs to `~/.ralph/` and symlinks `ralph` to `~/.local/bin/`.

## Quick Start

```bash
# 1. Plan
ralph plan "Add user authentication"

# 2. Refine (iterates until the plan is rock solid)
ralph refine

# 3. Review the plan
cat IMPLEMENTATION_PLAN.md

# 4. Build
ralph build
```

## Commands

```bash
ralph plan "goal"      # Create implementation plan
ralph plan             # Plan from GOAL.md file
ralph refine [n]       # Refine plan iteratively (default: 10 iterations)
ralph build [n]        # Run build loop (default: 10 iterations)
ralph plan --force     # Skip confirmation prompts
ralph update           # Update to latest version
```

## Agents

Supports Claude (default), Codex, and Cursor:

```bash
ralph build --agent codex
ralph build -a cursor
```

## How It Works

1. **Plan mode** reads your goal, searches the codebase, and generates `IMPLEMENTATION_PLAN.md` with atomic tasks
2. **Refine mode** iteratively improves the plan by alternating between investigation (find gaps) and review (staff-level assessment) until both agree it's ready
3. **Build mode** runs two phases per task: a build agent implements, then a review agent performs a staff-level code review, fixes issues, and commits. A final comprehensive review runs after all tasks complete
4. Build exits when all tasks are complete or max iterations reached

## Files

| File | Purpose |
|------|---------|
| `ralph.sh` | Main script |
| `prompts/plan.md` | Planning prompt |
| `prompts/refine_investigate.md` | Refine investigation prompt |
| `prompts/refine_review.md` | Refine review prompt |
| `prompts/build.md` | Build prompt (implement task) |
| `prompts/review.md` | Per-iteration code review prompt |
| `prompts/review_final.md` | Final comprehensive review prompt |
| `GOAL.md` | Your objective (optional, for complex goals) |
| `IMPLEMENTATION_PLAN.md` | Generated task list |
| `progress.txt` | Learning log between iterations |

## Requirements

One of:
- [Claude CLI](https://github.com/anthropics/claude-cli) (`claude`)
- [Codex CLI](https://github.com/openai/codex) (`codex`)
- [Cursor Agent](https://cursor.sh) (`agent`)
