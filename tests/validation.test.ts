import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { ResolvedConfig } from "../src/config/index.js";
import { IdentityError } from "../src/core/project-identity.js";
import { createCheckpoint } from "../src/git/checkpoint.js";
import {
  ValidationError,
  assertContextCurrent,
  startSession,
} from "../src/validation/index.js";

function git(dir: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
}

function makeRepo(tag: string, branch = "main"): string {
  const dir = mkdtempSync(join(tmpdir(), tag));
  git(dir, "init", "-q", "-b", branch);
  git(dir, "config", "user.email", "t@t.local");
  git(dir, "config", "user.name", "t");
  writeFileSync(join(dir, "f.txt"), "x\n");
  git(dir, "add", ".");
  git(dir, "commit", "-qm", "init");
  return dir;
}

function makeVault(): string {
  const dir = mkdtempSync(join(tmpdir(), "olc065-vault-"));
  mkdirSync(join(dir, "OLC"), { recursive: true });
  writeFileSync(join(dir, "OLC", "registry.json"), JSON.stringify({ projects: {} }));
  return dir;
}

function addProject(vault: string, projectId: string, repoRoot: string): void {
  const path = join(vault, "OLC", "registry.json");
  const registry = JSON.parse(readFileSync(path, "utf8")) as {
    projects: Record<string, { repoRoot: string }>;
  };
  registry.projects[projectId] = { repoRoot };
  writeFileSync(path, JSON.stringify(registry));
}

function configFor(vaultRoot: string, projectId: string): ResolvedConfig {
  return { schemaVersion: 1, projectId, vaultPath: vaultRoot };
}

function commitCount(repo: string): string {
  return git(repo, "rev-list", "--count", "HEAD");
}

test("startSession captures validated context; revalidation passes through", () => {
  const repo = makeRepo("olc065-repo-");
  const vault = makeVault();
  addProject(vault, "proj", repo);
  const config = configFor(vault, "proj");
  const session = startSession({ projectRoot: repo, config, date: "2026-10-12T10:00:00.000Z" });
  assert.equal(session.branch, "main");
  assert.equal(session.projectId, "proj");
  const again = assertContextCurrent({ projectRoot: repo, config, session });
  assert.equal(again.branch, "main");
  assert.equal(again.startedAt, session.startedAt);
});

test("vault unmounted between ops blocks with zero writes", () => {
  const repo = makeRepo("olc065-repo-");
  const vault = makeVault();
  addProject(vault, "proj", repo);
  const config = configFor(vault, "proj");
  const session = startSession({ projectRoot: repo, config });
  const before = commitCount(repo);
  rmSync(vault, { recursive: true, force: true });
  assert.throws(
    () => assertContextCurrent({ projectRoot: repo, config, session }),
    (e: unknown) => e instanceof IdentityError && e.code === "VAULT_UNAVAILABLE",
  );
  assert.equal(commitCount(repo), before);
});

test("registry rewritten to wrong repo between ops blocks", () => {
  const repo = makeRepo("olc065-repo-");
  const other = makeRepo("olc065-other-");
  const vault = makeVault();
  addProject(vault, "proj", repo);
  const config = configFor(vault, "proj");
  const session = startSession({ projectRoot: repo, config });
  addProject(vault, "proj", other);
  assert.throws(
    () => assertContextCurrent({ projectRoot: repo, config, session }),
    (e: unknown) => e instanceof IdentityError && e.code === "PROJECT_MISMATCH",
  );
});

test("inaccessible vault path blocks at session start", () => {
  const repo = makeRepo("olc065-repo-");
  const config = configFor(join(tmpdir(), "olc065-nope"), "proj");
  assert.throws(
    () => startSession({ projectRoot: repo, config }),
    (e: unknown) => e instanceof IdentityError && e.code === "VAULT_UNAVAILABLE",
  );
});

test("branch switched mid-session blocks as drift", () => {
  const repo = makeRepo("olc065-repo-");
  const vault = makeVault();
  addProject(vault, "proj", repo);
  const config = configFor(vault, "proj");
  const session = startSession({ projectRoot: repo, config });
  git(repo, "checkout", "-qb", "feature");
  try {
    assertContextCurrent({ projectRoot: repo, config, session });
  } catch (e: unknown) {
    assert.ok(e instanceof ValidationError && e.code === "SESSION_DRIFT");
    assert.match((e as Error).message, /branch changed/);
    return;
  }
  assert.fail("expected SESSION_DRIFT");
});

test("checkpoint with drifted session commits nothing", () => {
  const repo = makeRepo("olc065-repo-");
  const vault = makeVault();
  addProject(vault, "proj", repo);
  const config = configFor(vault, "proj");
  const session = startSession({ projectRoot: repo, config });
  git(repo, "checkout", "-qb", "feature");
  writeFileSync(join(repo, "f.txt"), "work\n");
  const before = commitCount(repo);
  assert.throws(
    () =>
      createCheckpoint({
        projectRoot: repo,
        config,
        taskId: "T-1",
        ownedPaths: ["f.txt"],
        snapshots: { "f.txt": "work\n" },
        summary: "should not land",
        session: { ...session, branch: "main" },
        date: "2026-10-12T10:00:00.000Z",
      }),
    (e: unknown) => e instanceof ValidationError && e.code === "SESSION_DRIFT",
  );
  assert.equal(commitCount(repo), before);
});
