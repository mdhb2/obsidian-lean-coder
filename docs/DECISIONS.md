# OLC — Open Decisions Log

Status board for technical decisions that must be validated/resolved during implementation (see `PRD.md` §12). Update each row with the outcome and task/commit evidence when resolved.

| # | Decision needed | Resolved? | Resolution / evidence |
|---|---|---|---|
| 1 | Final npm package name/scope and availability | Open | — |
| 2 | Exact OpenCode plugin API/entrypoint and resource delivery method (package, generated files, or both) | Open | — |
| 3 | Exact supported OpenCode version range | Open | — |
| 4 | Git CLI invocation strategy and supported platforms | Open | — |
| 5 | How to safely separate OLC-owned changes from unrelated manual changes (checkpoint safety spike, OLC-050) | Open | — |
| 6 | Whether automatic event logging is reliable via plugin hooks or needs a local recorder | Open | — |
| 7 | Final task status transition table | Open | — |

## Notes

- This file is the single source of truth for open product/technical decisions. Do not duplicate this list elsewhere.
- `docs/PRD.md` and `docs/TASKS.md` remain the sources of truth for requirements and task status respectively; this file only tracks decisions still pending resolution.
