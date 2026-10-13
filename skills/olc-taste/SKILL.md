---
name: olc-taste
description: Learn project-specific preferences without silently changing behavior. Repeated signals become pending proposals; only user approval activates them.
---

# olc-taste

Project taste is learned without silent behavior change: a repeated signal is recorded as a `pending` proposal complete with examples/evidence, and only an explicit user decision turns it `active`. Rejection parks it as `rejected` (kept as history, never used). A `pending` rule is never treated as active by any consumer.

## Hard rules

1. **Only the user activates.** There is no automatic pending→active path. Review is terminal: `active`/`rejected` cannot be re-reviewed (`BAD_TRANSITION`).
2. **Single-project scope.** Every path lives inside the validated project's `taste/`; other projects are untouched. This module never touches `tasks/` — approved intent/plan can't be overwritten from here.
3. **Proposals need evidence.** Without ≥1 example/repeated signal, a proposal is rejected outright (`INVALID_INPUT`). Duplicates are never silently merged (`ALREADY_EXISTS`).

## Flow

1. Propose: `proposeTasteRule({ projectRoot, config, name, rule, examples[] })` → `taste/<name>.md` with status `pending`, via the `taste-rule` template, atomic create-only write.
2. Read: `getTasteRule(...)` / `listTasteRules({ status? })` — only within the validated scope, name-sorted.
3. Explicit review with the user: `reviewTasteRule({ projectRoot, config, name, approve })` — `true` = pending→active, `false` = pending→rejected. Unknown name → `UNKNOWN_RULE`.

## Verifying this skill

- A `pending` rule never appears in the `active` list.
- `approve` activates, `reject` parks; re-reviewing a terminal status fails.
- Task intent/plan stay byte-identical before and after a propose→review cycle.
