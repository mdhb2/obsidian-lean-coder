---
name: olc-log
description: Record important events, checkpoints, and session summaries into a durable daily activity log. Verified crash-safe and secret-leak-safe.
---

# olc-log

Durable per-project activity log at `<vault>/OLC/Projects/<project_id>/logs/YYYY-MM-DD.md` (one file per day — that's its only rotation, no size-based rotation for MVP).

## Hard rules

1. **Explicit events only.** The module never hooks tool calls — no per-tool-call noise by construction. Log only milestones, checkpoints, verifications, and session summaries.
2. **Secrets are redacted, never stored.** Known credential patterns in summary/details are replaced with `[redacted]` and the entry is flagged.
3. **Safe appends.** One `O_APPEND` write per entry; an interruption never corrupts earlier entries. A file missing its trailing newline (crash remnant) is normalized before the next append.
4. **Identity first.** Wrong vault → throw with zero files created.

## Flow

The modules below are exposed as agent-callable tools under the `olc` namespace.
Call the tools, not the library functions directly.

1. Write: `olc_log_event` with `{ kind, summary, taskId?, details?, gitSha?, date? }` — `kind` e.g. `milestone|checkpoint|verify|session`; non-empty `summary` is required.
2. Read: `olc_memory_recall` (recent events included by default) or `olc_session_summary` for the latest.
3. Normal session end: call `olc_session_summary` — rendered via the `session-summary` template with an honest hard-kill footer, factual claims sourced only from a real verification/SHA/checkpoint — then show its markdown to the user. A session that dies abruptly produces no summary; the last log event is the recovery point (see resume).

## Verifying this skill

- Secret patterns like `sk-...`, `ghp_...`, `AKIA...` in a summary never reach the vault (they become `[redacted]`).
- An interruption mid-append never corrupts earlier entries.
