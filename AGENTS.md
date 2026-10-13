# AGENTS.md — OLC Project Instructions

## Project goal

Build OLC (Obsidian Lean Coder), an installable OpenCode extension distributed through npm. OLC provides two agents (`olc-plan`, `olc-build`) and supporting skills for project-scoped Obsidian Markdown memory, planning, logs, Git checkpoints, safe resume, and user-approved taste rules.

The source of truth for requirements is `docs/PRD.md`. The task list and task statuses are in `docs/TASKS.md`. If these files are missing, create/read the current PRD and task list before implementing significant features.

## Working style

- Keep work focused on MVP. Do not add dashboards, a database, mandatory MCP, autonomous branch switching, or unrelated orchestration.
- Prefer simple, understandable, maintainable designs over abstractions.
- Do not begin a task whose acceptance criteria or scope are unclear. Ask one focused question only when a consequential choice cannot be resolved from the PRD/repository.
- Work one task at a time. Update `docs/TASKS.md` status as work progresses and record evidence/results at task completion.
- Do not claim success unless supported by test output, build output, inspected files, or other concrete evidence.
- At the end of each working session, write a plain-language summary explaining what changed, the result, what remains, known blockers, tests run, and next step. Avoid unexplained technical jargon.

## Agent responsibilities

### olc-plan
- Read the root `AGENTS.md`, `docs/PRD.md`, and relevant task details.
- Inspect repository source and Git state before proposing an implementation plan.
- May write OLC planning documents in the configured vault, but must not modify application source files.
- Offer both Explore and direct Plan modes; recommend one based on complexity but let the user choose.
- Produce/revise `intent.md` and `plan.md` together. Do not start coding before the user explicitly approves both.

### olc-build
- Read root `AGENTS.md`, `docs/PRD.md`, current task entry in `docs/TASKS.md`, and applicable `.olc/AGENTS.md` for a consuming project.
- Implement only a task with an approved plan and bounded acceptance criteria.
- Inspect actual repository root, current branch, HEAD, working tree, diff, and untracked files before Git-sensitive operations.
- Use source and test results as ground truth. Do not infer test success.
- Small technical decisions and fixes are allowed within the approved task. Scope, product behavior, accepted risks, or architecture changes require user approval and a plan revision.
- If a blocker cannot be resolved after bounded attempts, stop, document attempts and evidence, and ask for direction.

## Safety rules — mandatory

1. Never run destructive Git operations (including `reset --hard`, force checkout, clean, branch deletion, or force-push) as a convenience or without explicit, informed user approval.
2. Never overwrite, discard, stage, or commit user/manual changes that are not clearly part of the current OLC task.
3. Before creating a checkpoint commit, inspect `git status --short`, relevant diffs, and untracked files. Stage explicit paths or carefully selected hunks only; do not use `git add .` or `git add -A` for OLC checkpoints.
4. If changes by OLC and the user are mixed and cannot be separated with confidence, stop and ask. Do not claim file ownership based only on who last edited the file.
5. Restoring a checkpoint must preserve later Git history. Prefer applying the selected snapshot as a new change/commit. Never silently move the branch backward or erase subsequent commits.
6. Before restore, verify the working tree and warn/stop if there are uncommitted or untracked changes at risk.
7. Never access or modify the wrong project's vault notes. Validate `project_id`, repo root, and vault registry before important reads/writes.
8. If configured vault is missing or unavailable, stop OLC-dependent operations. Do not create a hidden local fallback.
9. Never silently overwrite existing config, instructions, templates, plans, logs, or notes. `olc-init` must be idempotent and report created/preserved/skipped/attention-needed files.
10. Do not activate a taste rule, revise approved scope, mark a task done, or continue after an ambiguous resume without the required user approval.
11. Do not expose credentials, access tokens, secrets, or private vault contents in logs, docs, or test fixtures.
12. Do not make network calls or publish packages during tests unless explicitly requested.

## Implementation rules

- Validate all external input and file paths. Resolve paths and ensure writes remain within the intended project/vault roots.
- Prefer Node.js built-ins for filesystem/path/process needs unless a dependency materially simplifies a tested requirement.
- Keep the plugin runtime entrypoint thin and isolate configuration, project identity, vault, Git, logging, state transitions, and OpenCode integration into testable modules.
- Follow the actual supported OpenCode plugin API from current official docs; do not assume files in arbitrary `agents/` or `skills/` directories are auto-loaded.
- Separate package installation, OpenCode plugin registration, and project initialization in documentation.
- Do not hardcode a final npm scope/name before checking availability and recording the decision.
- Ensure templates are included in the published package. Use safe, deterministic file paths and UTF-8 Markdown.
- Avoid writes during module import/startup. Side effects must happen only in an explicit command/tool/action and be observable.
- Errors should say what failed, which resource is involved (without leaking secrets), and the safe next action.

## Verification expectations

For each relevant change, run the smallest meaningful checks and record exact results. Before declaring a task complete, run available tests plus typecheck/lint/build as appropriate.

Minimum release checks:
- Unit tests for config validation, project identity, vault path handling, status transitions, and checkpoint safety.
- Integration tests in a temporary git repository and temporary vault fixture.
- Tests that preserve unrelated modified and untracked files.
- Test `npm pack --dry-run` or `npm pack` and inspect included resources.
- A clean OpenCode profile smoke test against the documented supported version.
- Verify resume, scope escalation, taste-rule approval, and end-of-session plain-language summary.

If a check cannot be run in the current environment, explicitly mark it NOT RUN and explain why. Never fabricate results.

## Required session closeout

At the end of every normal working session:

1. **Reflection pass (persist what's worth keeping).** Evidence only — never
   fabricate. Use the OLC tools (namespace `olc`): reusable fact →
   `olc_memory_record`; repeated preference/correction → `olc_taste_propose`
   (stays `pending`, activate only via `olc_taste_review` after explicit user
   approval); design decision → `olc_decision_record` (writes
   `decisions/<YYYY-MM-DD>-<slug>.md`); important event → `olc_log_event`. If
   the tools or vault are unavailable, say so — never claim a save that did
   not happen.
2. **Summarize.** Call `olc_session_summary` and show its markdown.
3. **Report in simple language**: what was done, the observed result,
   tests/checks run with their outcomes, what remains or is blocked, the next
   suggested task, and the checkpoint commit reference if one was safely
   created.

The plain-language summary is mandatory even when the code changes are small.
