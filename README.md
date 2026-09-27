# Ralph

Ralph runs a coding task through the workflow I use now: independent Codex and Claude investigation, consensus on the smallest change, implementation, simplification, scoped review, runtime proof, and PR follow-through. It also handles evidence-backed no-change conclusions.

## Install

Requires Node.js 20+, authenticated Codex and Claude CLIs, Git, and GitHub CLI for PR runs.

```bash
curl -fsSL https://raw.githubusercontent.com/chris-nickerson/ralph/main/install.sh | bash
ralph doctor
# Optional: check that Claude can answer right now (uses a small model request)
ralph doctor --live
```

## Run a task

Run from a Git repository, or pass `--repo`. Ralph accepts a ticket, URL, bug report, or described feature. A full run can push a branch and prepare a PR. It does not merge or deploy.

```bash
ralph run "Fix the RSVP endpoint when the guest count is blank"
ralph plan "ACTION-1234"
ralph run "ACTION-1234" --diagnose-only
ralph run "Add a CSV export" --local-only
ralph run "Fix the login redirect" --keep-draft
```

The default pairing is Codex as orchestrator, Claude as independent partner, and a fresh Codex reviewer. The [workflow contract](workflow/WORKFLOW.md) defines the evidence gates and bounded review/PR loops. A full run creates a draft PR and promotes it only after validation; `--keep-draft` prevents promotion. `--local-only` performs no remote writes. `--diagnose-only` stops after diagnosis and consensus.

## Resume and inspect

```bash
ralph status
ralph list
ralph resume
ralph resume RUN_ID --instruction "Use the staging API for runtime proof"
ralph simplify RUN_ID
ralph review RUN_ID
ralph babysit RUN_ID
```

Active run state and evidence live in the repository's git-ignored `.ralph/runs/` directory. After a run completes, Ralph moves only that run into Git's private `ralph/archives/` directory outside the checkout. `status` and `list` can still find it, and `resume` restores it before continuing. Blocked and pending runs remain in place. Ralph records session IDs, phase evidence, last responses, and event logs. It does not erase runs or silently replay a failed external write. Read `workflow-state.md` before resuming a blocked run.

`plan` is the standalone two-model consensus command. `simplify`, `review`, and `babysit` focus an existing run on that phase after the CLI checks required phase evidence; they retain the same session and attempt budgets. Ralph's `partner` command makes restricted, recorded Claude calls for the orchestrator. A quota limit leaves the run resumable, and a failed first Codex launch can restart from its saved evidence.

## Workflow

1. Codex and Claude investigate independently, then exchange evidence-backed conclusions.
2. They agree on a disposition. No-change outcomes stop without a token diff.
3. Codex implements the agreed change and checkpoints it locally.
4. Claude reconsiders and simplifies the complete solution.
5. Fresh scoped review checks correctness, compliance, and completeness; accepted findings get bounded repair.
6. Ralph requires runtime proof of the affected surface, alongside engineering checks.
7. A full run publishes a draft PR, promotes it after validation, and follows CI and reviewer feedback within a fixed budget.

If required evidence or an agent is unavailable, Ralph records the blocker and stops. The run remains resumable.
