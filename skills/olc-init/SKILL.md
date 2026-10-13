---
name: olc-init
description: Safely and idempotently register one app repo + vault with OLC. Create-only — never overwrites existing files.
---

# olc-init

Initialize an OLC project: propose a `project_id`, confirm the vault path, set up `.olc/` and the vault structure, then register the repo↔vault pair in the registry.

## Hard rules

1. **Explain before writing.** State which files will be created before calling `initProject`.
2. **Create-only.** Existing files are reported as `preserved` — never overwritten. Anything needing a human decision comes back as `status: "needs-decision"` with an actionable message.
3. **No guessing the vault.** Precedence: explicit `vaultPath` > env `OLC_VAULT_PATH` > existing config. If none exist, ask the user — never silently create a default location.
4. **No prompting inside the module.** Gather answers first, then call again with the full parameters.

## Flow

1. Call `initProject({ projectRoot })` — get a proposed `project_id` (sanitized derivative of the repo name).
2. If `status: "needs-decision"`, ask the user: confirm `projectId`, fill in `vaultPath`, or resolve a duplicate id per the message.
3. Call again with `{ projectRoot, projectId, vaultPath }` until `status: "ready"`.
4. Ask the user: "Are there any additional project rules beyond what's in the
   main AGENTS.md?" If yes, write them to the "Additional project rules"
   section of `<repo>/.olc/AGENTS.md` (that file is create-only — if it
   already exists and already has rules, don't overwrite; merge only if the
   user asks).
5. Report a `created` / `preserved` / `attention` summary to the user in plain language.
5. To preview without writing: `initProject({ ..., dryRun: true })` — `created` means "would be created".

## What gets created (only if missing)

- `<repo>/.olc/config.json` — `{ schemaVersion, projectId, vaultPath }`. Keys that look like credentials (`secret|token|password|api-key`) are rejected.
- `<repo>/.olc/AGENTS.md` — instruction stub, asks the user to review and adjust.
- `<vault>/OLC/Projects/<project_id>/{index.md, current-state.md, decisions/, tasks/, logs/, memory/, taste/}`
- An entry `{ projects: { "<id>": { repoRoot } } }` in `<vault>/OLC/registry.json`.

## Verifying this skill

- Run init twice against a temporary fixture repo/vault: the second run is all `preserved`, no byte changes.
- Init with existing config + custom instructions: the custom file stays byte-identical.
