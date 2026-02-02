#!/bin/bash
# Ralph - Autonomous coding loop

set -e

# ─────────────────────────────────────────────────────────────────────────────
# Colors & Formatting
# ─────────────────────────────────────────────────────────────────────────────

TTY_OUT="false"
if [[ -t 1 ]] && [[ -n "$TERM" ]] && [[ "$TERM" != "dumb" ]]; then
  TTY_OUT="true"
  DIM=$'\e[2m'
  BOLD=$'\e[1m'
  RESET=$'\e[0m'
  GREEN=$'\e[32m'
  YELLOW=$'\e[33m'
  RED=$'\e[31m'
else
  DIM="" BOLD="" RESET="" GREEN="" YELLOW="" RED=""
fi

# Locale check for UTF-8 symbols
IS_UTF8="false"
if [[ "${LC_ALL:-${LC_CTYPE:-$LANG}}" == *"UTF-8"* ]]; then
  IS_UTF8="true"
fi

# Symbols
if [[ "$IS_UTF8" == "true" ]]; then
  SYM_DOT="•"
else
  SYM_DOT="."
fi
SYM_CHECK="done"
SYM_PAUSE="--"
SYM_BULLET="*"

# Fixed width for consistent formatting
WIDTH=74

# ─────────────────────────────────────────────────────────────────────────────
# Utilities
# ─────────────────────────────────────────────────────────────────────────────

# Print a line of characters
line() {
  printf '%*s' "$WIDTH" '' | tr ' ' '-'
}

# Print header with mode
print_header() {
  local mode="$1"
  echo ""
  echo "${DIM}$(line)${RESET}"
  echo "${BOLD}  ralph${RESET} ${DIM}${SYM_DOT}${RESET} ${mode}"
  echo "${DIM}$(line)${RESET}"
}

# Print a key-value status line
print_kv() {
  local key="$1"
  local value="$2"
  printf "  ${DIM}%-8s${RESET} %s\n" "$key" "$value"
}

# Print iteration separator
print_iteration() {
  local current="$1"
  local tasks="$2"
  local task_word="tasks"
  [[ "$tasks" -eq 1 ]] && task_word="task"
  
  echo ""
  echo "${DIM}$(line)${RESET}"
  echo "  iteration ${current} ${DIM}${SYM_DOT}${RESET} ${tasks} ${task_word} remaining"
  echo ""
}

# Print completion banner
print_complete() {
  local iterations="$1"
  local elapsed="$2"
  local iter_word="iteration"
  [[ "$iterations" -ne 1 ]] && iter_word="iterations"
  
  echo ""
  echo "${DIM}$(line)${RESET}"
  echo "  ${GREEN}${SYM_CHECK}${RESET} ${DIM}${SYM_DOT}${RESET} ${iterations} ${iter_word} ${DIM}${SYM_DOT}${RESET} ${elapsed}"
  echo "${DIM}$(line)${RESET}"
  echo ""
}

# Print limit reached banner
print_limit_reached() {
  local max="$1"
  echo ""
  echo "${DIM}$(line)${RESET}"
  echo "  ${YELLOW}${SYM_PAUSE}${RESET} iteration limit reached (${max})"
  echo "  ${DIM}Run${RESET} ${SCRIPT_NAME} build ${DIM}to continue${RESET}"
  echo "${DIM}$(line)${RESET}"
  echo ""
}

# Print error
print_error() {
  echo "${RED}error:${RESET} $1" >&2
}

# Print warning
print_warning() {
  echo ""
  echo "${YELLOW}warning:${RESET} $1"
}

# Format seconds as human readable
format_duration() {
  local seconds="$1"
  if [[ "$seconds" -lt 60 ]]; then
    echo "${seconds}s"
  elif [[ "$seconds" -lt 3600 ]]; then
    local mins=$((seconds / 60))
    local secs=$((seconds % 60))
    echo "${mins}m ${secs}s"
  else
    local hours=$((seconds / 3600))
    local mins=$(((seconds % 3600) / 60))
    echo "${hours}h ${mins}m"
  fi
}

# Prompt for confirmation
confirm() {
  local prompt="$1"
  local default="${2:-n}"
  
  [[ "$FORCE" == "true" ]] && return 0
  if [[ ! -t 0 ]]; then
    print_error "non-interactive mode; use --force to proceed"
    return 2
  fi
  
  local hint="[y/N]"
  [[ "$default" == "y" ]] && hint="[Y/n]"
  
  echo -n "${prompt} ${DIM}${hint}${RESET} "
  read -r response
  response="${response:-$default}"
  [[ "$response" =~ ^[Yy]$ ]]
}

# Check if file has content
has_content() {
  [[ -f "$1" ]] && [[ -s "$1" ]] && grep -q '[^[:space:]]' "$1" 2>/dev/null
}

# Count incomplete tasks
count_tasks() {
  if [[ -f "IMPLEMENTATION_PLAN.md" ]]; then
    local count
    count=$(grep -c '^\- \[ \]' "IMPLEMENTATION_PLAN.md" 2>/dev/null || true)
    echo "${count:-0}"
  else
    echo "0"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Setup
# ─────────────────────────────────────────────────────────────────────────────

RALPH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_NAME="$(basename "$0")"
# shellcheck source=/dev/null
[[ -f "ralph.env" ]] && source ralph.env

# ─────────────────────────────────────────────────────────────────────────────
# Help
# ─────────────────────────────────────────────────────────────────────────────

show_help() {
  cat << EOF
${BOLD}ralph${RESET} ${DIM}-${RESET} autonomous coding loop

${BOLD}USAGE${RESET}
    ${SCRIPT_NAME} plan [goal]           Create implementation plan
    ${SCRIPT_NAME} build [iterations]    Execute plan ${DIM}(default: 10)${RESET}

${BOLD}OPTIONS${RESET}
    -d, --debug     Run agent in foreground (see output in real-time)
    -f, --force     Skip confirmation prompts
    -h, --help      Show this help

${BOLD}AGENTS${RESET}
    Set ${DIM}RALPH_AGENT${RESET} env var or add to ${DIM}ralph.env${RESET}:
    
    claude          Claude Code CLI ${DIM}(default)${RESET}
    codex           OpenAI Codex CLI
    cursor          Cursor agent CLI

${BOLD}EXAMPLES${RESET}
    ${SCRIPT_NAME} plan "Add user authentication"
    ${SCRIPT_NAME} build
    ${SCRIPT_NAME} build 5
    RALPH_AGENT=codex ${SCRIPT_NAME} build

${BOLD}FILES${RESET}
    ${DIM}These files are created in your project directory:${RESET}
    
    GOAL.md                 Your objective ${DIM}(optional)${RESET}
    IMPLEMENTATION_PLAN.md  Generated task list
    progress.txt            Learning log
    ralph.env               Agent configuration

EOF
  exit 0
}

# ─────────────────────────────────────────────────────────────────────────────
# Argument Parsing
# ─────────────────────────────────────────────────────────────────────────────

DEBUG="false"
FORCE="false"
MODE=""
GOAL=""
MAX_ITERATIONS=10
POSITIONAL=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) show_help ;;
    -d|--debug) DEBUG="true"; shift ;;
    -f|--force) FORCE="true"; shift ;;
    plan|build) MODE="$1"; shift ;;
    *) POSITIONAL+=("$1"); shift ;;
  esac
done

if [[ "$MODE" == "plan" ]]; then
  [[ ${#POSITIONAL[@]} -gt 0 ]] && GOAL="${POSITIONAL[*]}"
elif [[ "$MODE" == "build" ]]; then
  [[ ${#POSITIONAL[@]} -gt 0 ]] && [[ "${POSITIONAL[0]}" =~ ^[0-9]+$ ]] && MAX_ITERATIONS="${POSITIONAL[0]}"
fi

[[ -z "$MODE" ]] && MODE="build"

# ─────────────────────────────────────────────────────────────────────────────
# Agent Setup
# ─────────────────────────────────────────────────────────────────────────────

RALPH_AGENT="${RALPH_AGENT:-claude}"
PROMPT_FILE="$RALPH_DIR/PROMPT_${MODE}.md"

get_agent_cmd() {
  case "$RALPH_AGENT" in
    claude) echo "claude" ;;
    codex)  echo "codex" ;;
    cursor) echo "agent" ;;
    *)      return 1 ;;
  esac
}

AGENT_CMD=$(get_agent_cmd) || {
  print_error "unknown agent '${RALPH_AGENT}'"
  echo "Supported agents: claude, codex, cursor"
  exit 1
}

if ! command -v "$AGENT_CMD" &>/dev/null; then
  print_error "'${AGENT_CMD}' CLI not found in PATH"
  exit 1
fi

if [[ ! -f "$PROMPT_FILE" ]]; then
  print_error "prompt file not found: $PROMPT_FILE"
  exit 1
fi

# ─────────────────────────────────────────────────────────────────────────────
# Cleanup & Signal Handling
# ─────────────────────────────────────────────────────────────────────────────

TMPFILE=""
CURSOR_HIDDEN="false"

cleanup() {
  local exit_code
  exit_code=$?
  set +e

  # Restore cursor if we hid it
  if [[ "$CURSOR_HIDDEN" == "true" ]]; then
    printf "\e[?25h" 2>/dev/null || true
  fi
  # Clean up temp file
  if [[ -n "$TMPFILE" ]] && [[ -f "$TMPFILE" ]]; then
    rm -f "$TMPFILE" || true
  fi
  # Kill any background agent process
  if [[ -n "$AGENT_PID" ]]; then
    kill "$AGENT_PID" 2>/dev/null || true
  fi

  return "$exit_code"
}

trap cleanup EXIT INT TERM

# ─────────────────────────────────────────────────────────────────────────────
# Agent Runner
# ─────────────────────────────────────────────────────────────────────────────

AGENT_PID=""
AGENT_OUTPUT=""  # Stores last agent output for completion detection

# Spinner animation with elapsed time
show_spinner() {
  local pid="$1"
  local start="$2"
  local activity="${3:-running}"
  local frames
  local i=0
  
  [[ "$TTY_OUT" == "true" ]] || return 0
  
  if [[ "$IS_UTF8" == "true" ]]; then
    frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
  else
    frames=("-" "\\" "|" "/")
  fi
  local frame_count=${#frames[@]}

  # Hide cursor
  CURSOR_HIDDEN="true"
  printf "\e[?25l"
  
  while kill -0 "$pid" 2>/dev/null; do
    local elapsed=$(($(date +%s) - start))
    printf "\r  ${DIM}%s${RESET} ${activity} ${DIM}%s${RESET}" "${frames[i % frame_count]}" "$(format_duration $elapsed)"
    i=$((i + 1))
    sleep 0.08
  done
  
  # Show cursor, clear line
  printf "\e[?25h"
  CURSOR_HIDDEN="false"
  printf "\r%*s\r" 40 ""
}

# Run agent with spinner, output stored in AGENT_OUTPUT
run_agent() {
  local prompt="$1"
  local activity="${2:-running}"
  local elapsed_start="$3"
  local start_time
  local exit_code
  start_time=$(date +%s)
  [[ -z "$elapsed_start" ]] && elapsed_start="$start_time"
  
  # Debug mode: run in foreground with direct output
  if [[ "$DEBUG" == "true" ]]; then
    echo "${DIM}debug: running ${AGENT_CMD}...${RESET}"
    echo ""
    TMPFILE=$(mktemp "${TMPDIR:-/tmp}/ralph.XXXXXX") || {
      print_error "failed to create temp file"
      exit 1
    }
    case "$RALPH_AGENT" in
      claude) printf '%s' "$prompt" | claude -p --dangerously-skip-permissions 2>&1 | tee "$TMPFILE" ;;
      codex)  printf '%s' "$prompt" | codex exec --yolo 2>&1 | tee "$TMPFILE" ;;
      cursor) printf '%s' "$prompt" | agent -p -f 2>&1 | tee "$TMPFILE" ;;
    esac
    exit_code=${PIPESTATUS[1]}
    AGENT_OUTPUT=$(cat "$TMPFILE")
    rm -f "$TMPFILE"
    TMPFILE=""
    echo ""
    echo "${DIM}debug: exit code ${exit_code}${RESET}"
    return $exit_code
  fi
  
  TMPFILE=$(mktemp "${TMPDIR:-/tmp}/ralph.XXXXXX") || {
    print_error "failed to create temp file"
    exit 1
  }
  
  # Run agent in background
  case "$RALPH_AGENT" in
    claude) printf '%s' "$prompt" | claude -p --dangerously-skip-permissions > "$TMPFILE" 2>&1 & ;;
    codex)  printf '%s' "$prompt" | codex exec --yolo > "$TMPFILE" 2>&1 & ;;
    cursor) printf '%s' "$prompt" | agent -p -f > "$TMPFILE" 2>&1 & ;;
  esac
  AGENT_PID=$!
  
  # Show spinner while agent runs
  show_spinner "$AGENT_PID" "$elapsed_start" "$activity"
  
  # Wait and capture exit code
  wait "$AGENT_PID" 2>/dev/null
  exit_code=$?
  AGENT_PID=""
  
  # Store output for caller to inspect
  AGENT_OUTPUT=$(cat "$TMPFILE")
  
  # Display output
  printf '%s' "$AGENT_OUTPUT"
  
  # Warn if agent failed or produced no output
  if [[ "$exit_code" -ne 0 ]]; then
    echo ""
    print_warning "agent exited with code ${exit_code}"
    echo "  ${DIM}Run with --debug for more details${RESET}"
  elif [[ -z "$AGENT_OUTPUT" ]]; then
    echo ""
    print_warning "agent produced no output"
    echo "  ${DIM}Run with --debug for more details${RESET}"
  fi
  
  # Cleanup
  rm -f "$TMPFILE"
  TMPFILE=""
  
  return $exit_code
}

# ─────────────────────────────────────────────────────────────────────────────
# Plan Mode
# ─────────────────────────────────────────────────────────────────────────────

run_plan() {
  local has_plan
  local has_progress
  if has_content "IMPLEMENTATION_PLAN.md"; then
    has_plan="true"
  else
    has_plan="false"
  fi
  if has_content "progress.txt"; then
    has_progress="true"
  else
    has_progress="false"
  fi
  
  if [[ "$has_plan" == "true" ]] || [[ "$has_progress" == "true" ]]; then
    print_warning "existing state will be cleared:"
    [[ "$has_plan" == "true" ]] && echo "    ${DIM}${SYM_BULLET}${RESET} IMPLEMENTATION_PLAN.md"
    [[ "$has_progress" == "true" ]] && echo "    ${DIM}${SYM_BULLET}${RESET} progress.txt"
    echo ""
    
    confirm "Continue?"
    local status=$?
    if [[ "$status" -eq 2 ]]; then
      exit 1
    elif [[ "$status" -ne 0 ]]; then
      echo "${DIM}Cancelled.${RESET}"
      exit 0
    fi
  fi
  
  : > progress.txt
  : > IMPLEMENTATION_PLAN.md
  
  # Determine goal display
  local goal_display
  if [[ -n "$GOAL" ]]; then
    goal_display="${GOAL:0:50}"
    [[ ${#GOAL} -gt 50 ]] && goal_display="${goal_display}..."
  elif [[ -f "GOAL.md" ]] && has_content "GOAL.md"; then
    goal_display="${DIM}from${RESET} GOAL.md"
  else
    goal_display="${DIM}audit mode${RESET}"
  fi
  
  print_header "planning"
  echo ""
  print_kv "agent" "$RALPH_AGENT"
  print_kv "goal" "$goal_display"
  echo ""
  
  local start_time
  start_time=$(date +%s)
  
  # Build and run prompt
  local prompt
  prompt=$(cat "$PROMPT_FILE")
  prompt+=$'\n\n## Goal\n\n'
  if [[ -n "$GOAL" ]]; then
    prompt+="$GOAL"
  elif [[ -f "GOAL.md" ]]; then
    prompt+=$(cat "GOAL.md")
  else
    prompt+="(No goal specified - audit existing specs against codebase)"
  fi
  
  run_agent "$prompt" "planning" "$start_time"
  
  local end_time
  end_time=$(date +%s)
  local elapsed=$((end_time - start_time))
  
  if has_content "IMPLEMENTATION_PLAN.md"; then
    local task_count
    task_count=$(count_tasks)
    local task_word="tasks"
    [[ "$task_count" -eq 1 ]] && task_word="task"
    
    echo ""
    echo "${DIM}$(line)${RESET}"
    echo "  ${GREEN}${SYM_CHECK}${RESET} ${DIM}${SYM_DOT}${RESET} plan created ${DIM}${SYM_DOT}${RESET} ${task_count} ${task_word} ${DIM}${SYM_DOT}${RESET} $(format_duration $elapsed)"
    echo "${DIM}$(line)${RESET}"
    echo ""
    echo "  ${DIM}Review:${RESET}  cat IMPLEMENTATION_PLAN.md"
    echo "  ${DIM}Build:${RESET}   ${SCRIPT_NAME} build"
    echo ""
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Build Mode
# ─────────────────────────────────────────────────────────────────────────────

run_build() {
  if ! has_content "IMPLEMENTATION_PLAN.md"; then
    print_error "no implementation plan found"
    echo ""
    echo "  ${DIM}Create a plan first:${RESET}"
    echo "  ${SCRIPT_NAME} plan \"your goal\""
    echo ""
    exit 1
  fi
  
  local task_count
  task_count=$(count_tasks)
  
  print_header "building"
  echo ""
  print_kv "agent" "$RALPH_AGENT"
  print_kv "tasks" "${task_count} remaining"
  print_kv "limit" "${MAX_ITERATIONS} iterations"
  
  if [[ "$task_count" -eq 0 ]]; then
    echo ""
    echo "${DIM}$(line)${RESET}"
    echo "  ${GREEN}${SYM_CHECK}${RESET} all tasks complete"
    echo "${DIM}$(line)${RESET}"
    echo ""
    exit 0
  fi
  
  local start_time
  start_time=$(date +%s)
  local iteration=0
  
  while true; do
    iteration=$((iteration + 1))
    
    if [[ "$iteration" -gt "$MAX_ITERATIONS" ]]; then
      print_limit_reached "$MAX_ITERATIONS"
      exit 0
    fi
    
    task_count=$(count_tasks)
    print_iteration "$iteration" "$task_count"
    
    local iter_start
    iter_start=$(date +%s)
    run_agent "$(cat "$PROMPT_FILE")" "building" "$start_time" || true
    local iter_end
    iter_end=$(date +%s)
    local iter_elapsed=$((iter_end - iter_start))
    
    echo ""
    echo "${DIM}  iteration elapsed: $(format_duration $iter_elapsed)${RESET}"
    
    # Check for completion
    local last_lines
    last_lines=$(printf '%s' "$AGENT_OUTPUT" | tail -n 5)
    if [[ "$last_lines" == *"<done>COMPLETE</done>"* ]]; then
      local end_time
      end_time=$(date +%s)
      local elapsed=$((end_time - start_time))
      print_complete "$iteration" "$(format_duration $elapsed)"
      exit 0
    fi
    
    sleep 1
  done
}

# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

case "$MODE" in
  plan)  run_plan ;;
  build) run_build ;;
esac
