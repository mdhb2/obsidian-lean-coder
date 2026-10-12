# OLC — Obsidian Lean Coder

OLC is an OpenCode extension under development. It is intended to provide project-scoped Obsidian memory, planning/build agents, durable logs, safe Git checkpoints, resumable work, and user-approved taste rules.

## Status

The project is in the specification/planning stage. The PRD and task board are not proof that features are implemented. See `docs/PRD.md` and `docs/TASKS.md`.

## Development starting point

1. Open this repository in OpenCode.
2. Read `AGENTS.md`, `docs/PRD.md`, and `docs/TASKS.md`.
3. Execute one task at a time. Start with `OLC-001`, then `OLC-002`.
4. Keep `docs/TASKS.md` updated with actual status and verification evidence.
5. Do not publish to npm until a separate explicit approval is given.

## Intended installation model

OLC is intended to be packaged on npm and loaded by OpenCode using the plugin activation mechanism supported by the target OpenCode version. The exact npm name/scope and final installation/configuration commands are still to be verified during tasks OLC-010, OLC-012, and OLC-070.

Do not confuse these separate steps:

- installing npm dependencies for local development;
- registering/activating the package as an OpenCode plugin;
- initializing OLC for a particular application repository and Obsidian vault.
