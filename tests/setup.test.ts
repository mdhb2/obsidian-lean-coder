import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const BIN = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "bin", "olc-setup.js");
const OWNED = [
  "agents/olc-plan.md",
  "agents/olc-build.md",
  "skills/olc-explore/SKILL.md",
];

function run(cwd: string, args: string[], env: Record<string, string> = {}): string {
  return execFileSync(process.execPath, [BIN, ...args], {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

function runExpectFail(cwd: string, args: string[], env: Record<string, string> = {}): number | null {
  try {
    run(cwd, args, env);
  } catch (error) {
    return (error as { status?: number | null }).status ?? null;
  }
  assert.fail(`expected failure for args ${JSON.stringify(args)}`);
}

function pkgSource(rel: string): string {
  return readFileSync(resolve(dirname(BIN), "..", rel), "utf8");
}

test("project scope creates owned files with package bytes", () => {
  const dir = mkdtempSync(join(tmpdir(), "olc075-proj-"));
  const out = run(dir, ["setup"]);
  assert.match(out, /3 created, 0 overwritten, 0 skipped/);
  for (const rel of OWNED) {
    const dest = join(dir, ".opencode", rel);
    assert.ok(existsSync(dest), `missing ${dest}`);
    assert.equal(readFileSync(dest, "utf8"), pkgSource(rel));
  }
  assert.ok(!existsSync(join(dir, "opencode.json")), "opencode.json must never be created");
});

test("rerun skips identical files; modified owned file is overwritten", () => {
  const dir = mkdtempSync(join(tmpdir(), "olc075-proj-"));
  run(dir, ["setup"]);
  const second = run(dir, ["setup"]);
  assert.match(second, /0 created, 0 overwritten, 3 skipped/);
  const target = join(dir, ".opencode", OWNED[0]);
  writeFileSync(target, "user-customized\n");
  const third = run(dir, ["setup"]);
  assert.match(third, /0 created, 1 overwritten, 2 skipped/);
  assert.equal(readFileSync(target, "utf8"), pkgSource(OWNED[0]));
});

test("dry-run writes nothing", () => {
  const dir = mkdtempSync(join(tmpdir(), "olc075-proj-"));
  const out = run(dir, ["setup", "--dry-run"]);
  assert.match(out, /\[dry-run\]/);
  assert.ok(!existsSync(join(dir, ".opencode")), "dry-run must not create directories");
});

test("global scope lands under XDG_CONFIG_HOME and leaves cwd alone", () => {
  const dir = mkdtempSync(join(tmpdir(), "olc075-proj-"));
  const xdg = mkdtempSync(join(tmpdir(), "olc075-xdg-"));
  const out = run(dir, ["setup", "--global"], { XDG_CONFIG_HOME: xdg });
  assert.match(out, /global scope/);
  for (const rel of OWNED) {
    const dest = join(xdg, "opencode", ".opencode", rel);
    assert.ok(existsSync(dest), `missing ${dest}`);
    assert.equal(readFileSync(dest, "utf8"), pkgSource(rel));
  }
  assert.ok(!existsSync(join(dir, ".opencode")), "global run must not touch cwd");
});

test("unknown args and missing subcommand fail with usage", () => {
  const dir = mkdtempSync(join(tmpdir(), "olc075-proj-"));
  assert.equal(runExpectFail(dir, ["setup", "--bogus"]), 2);
  assert.equal(runExpectFail(dir, []), 2);
  assert.ok(!existsSync(join(dir, ".opencode")), "failed runs must write nothing");
});

test("missing parent dirs are created (mkdir -p)", () => {
  const dir = mkdtempSync(join(tmpdir(), "olc075-proj-"));
  const nested = join(dir, "a", "b");
  mkdirSync(nested, { recursive: true });
  run(nested, ["setup", "--project"]);
  assert.ok(existsSync(join(nested, ".opencode", "skills", "olc-explore", "SKILL.md")));
});
