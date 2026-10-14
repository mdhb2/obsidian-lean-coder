#!/usr/bin/env node
/**
 * OLC setup helper (OLC-075).
 *
 * Manually run after `npm install -g obsidian-lean-coder` (or npx):
 *   olc-setup setup [--project|--global] [--dry-run]
 *
 * Copies the shipped agent/skill resources into OpenCode's discovery paths:
 *   project scope (default): <cwd>/.opencode/{agents,skills}
 *   global scope:            ~/.config/opencode/{agents,skills}
 *                            ($XDG_CONFIG_HOME/opencode when set)
 *
 * Behavior (locked with the user):
 * - Missing directories are created (mkdir -p).
 * - Existing OLC agent/skill files are OVERWRITTEN with the package
 *   versions. This is a deliberate, narrow exception to OLC's usual
 *   create-only rule — and it applies ONLY to the files this command owns
 *   (listed in OWNED_FILES below). Nothing else is touched.
 * - `--dry-run` prints what would happen and writes nothing.
 * - `opencode.json` is NEVER edited by this command. After it runs, it
 *   prints the manual plugin-registration snippet for README §2.
 *
 * Node builtins only — no runtime dependencies.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

/** Files this command owns: [package-relative source, scope-relative dest]. */
const OWNED_FILES = [
  ["agents/olc-plan.md", ".opencode/agents/olc-plan.md"],
  ["agents/olc-build.md", ".opencode/agents/olc-build.md"],
  ["skills/olc-init/SKILL.md", ".opencode/skills/olc-init/SKILL.md"],
  ["skills/olc-explore/SKILL.md", ".opencode/skills/olc-explore/SKILL.md"],
  ["skills/olc-log/SKILL.md", ".opencode/skills/olc-log/SKILL.md"],
];

function usage() {
  return [
    "Usage: olc-setup setup [--project|--global] [--dry-run]",
    "",
    "  setup            copy shipped agents/skills into OpenCode discovery paths",
    "  --project        install into <cwd>/.opencode (default)",
    "  --global         install into ~/.config/opencode ($XDG_CONFIG_HOME/opencode when set)",
    "  --dry-run        print what would happen, write nothing",
    "",
    "Existing OLC agent/skill files are overwritten with the package versions;",
    "nothing else is touched, and opencode.json is never edited (see the",
    "manual plugin-registration snippet printed after a successful run).",
  ].join("\n");
}

function fail(message) {
  process.stderr.write(`olc-setup: ${message}\n${usage()}\n`);
  process.exit(2);
}

function parseArgs(argv) {
  if (argv[0] !== "setup") fail(`expected subcommand \"setup\", got ${JSON.stringify(argv[0] ?? "(none)")}.`);
  let scope = "project";
  let dryRun = false;
  for (const arg of argv.slice(1)) {
    if (arg === "--project") scope = "project";
    else if (arg === "--global") scope = "global";
    else if (arg === "--dry-run") dryRun = true;
    else fail(`unknown argument ${JSON.stringify(arg)}.`);
  }
  return { scope, dryRun };
}

function packageRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

function scopeRoot(scope) {
  if (scope === "project") return resolve(process.cwd());
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return resolve(base, "opencode");
}

function main() {
  const { scope, dryRun } = parseArgs(process.argv.slice(2));
  const pkg = packageRoot();
  const root = scopeRoot(scope);

  const missing = OWNED_FILES.map(([src]) => src).filter((src) => !existsSync(join(pkg, src)));
  if (missing.length > 0) {
    process.stderr.write(
      `olc-setup: installed package is incomplete, missing: ${missing.join(", ")}. Reinstall obsidian-lean-coder.\n`,
    );
    process.exit(1);
  }

  const summary = [];
  for (const [src, destRel] of OWNED_FILES) {
    const dest = join(root, destRel);
    const wanted = readFileSync(join(pkg, src), "utf8");
    const prior = existsSync(dest) ? readFileSync(dest, "utf8") : null;
    if (prior === wanted) {
      summary.push({ file: destRel, action: "skipped" });
      continue;
    }
    if (!dryRun) {
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, wanted, "utf8");
    }
    summary.push({ file: destRel, action: prior === null ? "created" : "overwritten" });
  }

  const counts = { created: 0, overwritten: 0, skipped: 0 };
  for (const entry of summary) {
    counts[entry.action] += 1;
    process.stdout.write(`${entry.action}  ${entry.file}\n`);
  }
  process.stdout.write(
    `${dryRun ? "[dry-run] " : ""}done (${scope} scope, ${root}): ` +
      `${counts.created} created, ${counts.overwritten} overwritten, ${counts.skipped} skipped.\n`,
  );
  if (!dryRun) {
    process.stdout.write(
      "\nNext (manual): register the plugin in opencode.json so OpenCode loads it:\n" +
        '  { "plugins": ["obsidian-lean-coder"] }\n' +
        "See README §2 for verification. opencode.json was left untouched.\n",
    );
  }
}

main();
