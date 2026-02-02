# Ralph

Autonomous coding loop that plans and implements features iteratively using AI agents.

## Quick Start

```bash
# 1. Plan
./ralph.sh plan "Add user authentication"

# 2. Review the plan
cat IMPLEMENTATION_PLAN.md

# 3. Build
./ralph.sh build
```

## Commands

```bash
./ralph.sh plan "goal"      # Create implementation plan
./ralph.sh plan             # Plan from GOAL.md file
./ralph.sh build [n]        # Run build loop (default: 10 iterations)
./ralph.sh plan --force     # Skip confirmation prompts
```

## Agents

Supports Claude (default), Codex, and Cursor. Set via environment:

```bash
# Option 1: Environment variable
RALPH_AGENT=codex ./ralph.sh build

# Option 2: Config file (edit ralph.env)
RALPH_AGENT=cursor
```

## How It Works

1. **Plan mode** reads your goal, searches the codebase, and generates `IMPLEMENTATION_PLAN.md` with atomic tasks
2. **Build mode** picks the next incomplete task, implements it, runs validation, commits, and loops
3. Build exits when all tasks are complete or max iterations reached

## Files

| File | Purpose |
|------|---------|
| `ralph.sh` | Main script |
| `PROMPT_plan.md` | Planning prompt |
| `PROMPT_build.md` | Build prompt |
| `GOAL.md` | Your objective (optional, for complex goals) |
| `IMPLEMENTATION_PLAN.md` | Generated task list |
| `progress.txt` | Learning log between iterations |

## Requirements

One of:
- [Claude CLI](https://github.com/anthropics/claude-cli) (`claude`)
- [Codex CLI](https://github.com/openai/codex) (`codex`)
- [Cursor Agent](https://cursor.sh) (`agent`)
