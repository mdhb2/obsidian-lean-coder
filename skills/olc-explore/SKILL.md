---
name: olc-explore
description: Investigate a complex/uncertain request before planning. Read-only against app code; produces a single exploration report in the vault.
---

# olc-explore

Clarify a complex or uncertain request **before** `intent.md`/`plan.md` are created.
For simple, already-clear tasks, skip this skill and go straight to Plan (direct Plan).

## When to use vs direct Plan

- Use Explore when: the request is ambiguous, touches unfamiliar territory, has multiple approaches with real tradeoffs, or carries a high risk of misunderstanding.
- Use direct Plan when: the change is small and localized, the approach is already clear, there are no material open questions.
- The user's choice wins: if the user asks for direct Plan, don't force Explore, and vice versa.

## Hard rules

1. **Read-only against app source.** Allowed: reading files, running read-only commands (status, log, read-only tests), tracing code. FORBIDDEN: changing, adding, or removing app files in any way — no "while I'm at it" fixes, no small refactors.
2. One active report per task: `tasks/<task-id>/explore/report.md` in the already-validated project vault (OLC-021). Do not create a competing report file.
3. Every finding claim needs evidence: a file path + line, command output, or a config quote. No evidence = open question, not a finding.
4. Revisions never erase important reasoning: a revision is added as a new dated section in the same report; the reason for the approach change must be recorded.

## Flow

1. Validate project identity and read `project_id` from `.olc/config.json` (no vault operation passes before this).
2. Read the user's request plus just enough relevant context (vault index/current-state if present, related app files). Do not read the entire vault.
3. Write the report via the `explore-report` template (vars: `task_id`, `project_id`, `date`, `request`, `findings`, `options`, `recommendation`). Create the `explore/` directory if missing; never overwrite an already-customized report without approval (follow OLC-023's create-only rule).
4. If the request changes or new findings appear: add a new dated revision section to the same report, record the reason in the task's `history.md`.
5. Hand off to Plan: the explore report is input to `draftTaskDocs`, not a replacement for `intent.md`/`plan.md`. No coding happens until both documents are approved (OLC-032).

## Verifying this skill

- After Explore: `git status --short` in the app repo must be clean (no app changes).
- The report exists at the correct path and every template var is filled (no leftover `{{...}}`).
