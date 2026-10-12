import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { ResolvedConfig } from "../src/config/index.js";
import { CheckpointError, createCheckpoint } from "../src/git/checkpoint.js";
import { IdentityError } from "../src/core/project-identity.js";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).replace(/\s+$/, "");
}

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "olc051-repo-"));
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "test@local");
  git(dir, "config", "user.name", "test");
  writeFileSync(join(dir, "app.txt"), "v1\n");
  writeFileSync(join(dir, "user.txt"), "user base\n");
  git(dir, "add", ".");
  git(dir, "commit", "-qm", "init");
  return dir;
}

function makeVault(projectId: string, repoRoot: string): string {
  const dir = mkdtempSync(join(tmpdir(), "olc051-vault-"));
  mkdirSync(join(dir, "OLC"), { recursive: true });
  writeFileSync(
    join(dir, "OLC", "registry.json"),
    JSON.stringify({ projects: { [projectId]: { repoRoot } } }),
  );
  return dir;
}

function setup(projectId = "proj"): { repo: string; vault: string; config: ResolvedConfig } {
  const repo = makeRepo();
  const vault = makeVault(projectId, repo);
  const config: ResolvedConfig = { schemaVersion: 1, projectId, vaultPath: vault };
  return { repo, vault, config };
}

function commitCount(repo: string): string {
  return git(repo, "rev-list", "--count", "HEAD");
}

function commitFiles(repo: string): string[] {
  const out = git(repo, "show", "--name-only", "--pretty=format:", "HEAD");
  return out === "" ? [] : out.split("\n");
}

test("owned change commits alone; user edit and untracked file survive; record cross-refs SHA", () => {
  const { repo, config } = setup();
  writeFileSync(join(repo, "app.txt"), "v1\nOLC-WORK\n");
  writeFileSync(join(repo, "user.txt"), "USER-EDIT\nuser base\n");
  writeFileSync(join(repo, "notes.txt"), "scratch\n");

  const result = createCheckpoint({
    projectRoot: repo,
    config,
    taskId: "T-1",
    ownedPaths: ["app.txt"],
    snapshots: { "app.txt": "v1\nOLC-WORK\n" },
    summary: "Add OLC work line",
    verification: "npm test: 1 pass",
    date: "2026-10-12T00:00:00.000Z",
  });

  assert.equal(result.status, "committed");
  if (result.status !== "committed") return;
  assert.deepEqual(commitFiles(repo), ["app.txt"]);
  assert.match(git(repo, "log", "-1", "--pretty=%B"), /olc checkpoint: T-1/);
  assert.equal(readFileSync(join(repo, "user.txt"), "utf8"), "USER-EDIT\nuser base\n");
  assert.equal(readFileSync(join(repo, "notes.txt"), "utf8"), "scratch\n");
  assert.equal(git(repo, "status", "--porcelain=v1", "-uall"), " M user.txt\n?? notes.txt");
  const record = readFileSync(result.recordPath, "utf8");
  assert.ok(record.includes(result.sha), "record must contain the commit SHA");
  assert.ok(record.includes("npm test: 1 pass"), "record must contain verification");
});

test("foreign edit aborts with zero git mutation", () => {
  const { repo, config } = setup();
  writeFileSync(join(repo, "app.txt"), "v1\nOLC-WORK\nUSER-TWEAK\n");
  const before = commitCount(repo);
  assert.throws(
    () =>
      createCheckpoint({
        projectRoot: repo,
        config,
        taskId: "T-1",
        ownedPaths: ["app.txt"],
        snapshots: { "app.txt": "v1\nOLC-WORK\n" },
        summary: "x",
      }),
    (e: unknown) => e instanceof CheckpointError && e.code === "FOREIGN_EDIT",
  );
  assert.equal(commitCount(repo), before);
  assert.equal(git(repo, "diff", "--cached", "--name-only"), "", "nothing staged");
});

test("pre-staged owned path aborts", () => {
  const { repo, config } = setup();
  writeFileSync(join(repo, "app.txt"), "v1\nOLC-WORK\n");
  git(repo, "add", "--", "app.txt");
  const before = commitCount(repo);
  assert.throws(
    () =>
      createCheckpoint({
        projectRoot: repo,
        config,
        taskId: "T-1",
        ownedPaths: ["app.txt"],
        snapshots: { "app.txt": "v1\nOLC-WORK\n" },
        summary: "x",
      }),
    (e: unknown) => e instanceof CheckpointError && e.code === "OWNED_PATH_PRESTAGED",
  );
  assert.equal(commitCount(repo), before);
});

test("foreign staged changes on other paths survive the pathspec commit", () => {
  const { repo, config } = setup();
  writeFileSync(join(repo, "user.txt"), "USER-EDIT\nuser base\n");
  git(repo, "add", "--", "user.txt");
  writeFileSync(join(repo, "app.txt"), "v1\nOLC-WORK\n");
  const result = createCheckpoint({
    projectRoot: repo,
    config,
    taskId: "T-1",
    ownedPaths: ["app.txt"],
    snapshots: { "app.txt": "v1\nOLC-WORK\n" },
    summary: "x",
  });
  assert.equal(result.status, "committed");
  assert.deepEqual(commitFiles(repo), ["app.txt"]);
  assert.equal(git(repo, "diff", "--cached", "--name-only"), "user.txt");
});

test("clean owned paths return clean status with no commit", () => {
  const { repo, config } = setup();
  const before = commitCount(repo);
  const result = createCheckpoint({
    projectRoot: repo,
    config,
    taskId: "T-1",
    ownedPaths: ["app.txt"],
    snapshots: { "app.txt": "v1\n" },
    summary: "x",
  });
  assert.equal(result.status, "clean");
  assert.equal(commitCount(repo), before);
});

test("second checkpoint appends; record holds both SHAs", () => {
  const { repo, config } = setup();
  writeFileSync(join(repo, "app.txt"), "v1\nONE\n");
  const first = createCheckpoint({
    projectRoot: repo,
    config,
    taskId: "T-1",
    ownedPaths: ["app.txt"],
    snapshots: { "app.txt": "v1\nONE\n" },
    summary: "one",
  });
  writeFileSync(join(repo, "app.txt"), "v1\nONE\nTWO\n");
  const second = createCheckpoint({
    projectRoot: repo,
    config,
    taskId: "T-1",
    ownedPaths: ["app.txt"],
    snapshots: { "app.txt": "v1\nONE\nTWO\n" },
    summary: "two",
  });
  assert.equal(first.status, "committed");
  assert.equal(second.status, "committed");
  if (first.status !== "committed" || second.status !== "committed") return;
  const record = readFileSync(second.recordPath, "utf8");
  assert.equal(first.recordPath, second.recordPath);
  assert.ok(record.includes(first.sha) && record.includes(second.sha));
});

test("identity mismatch blocks with no commit", () => {
  const { repo, vault } = setup("proj");
  const wrong: ResolvedConfig = { schemaVersion: 1, projectId: "other", vaultPath: vault };
  writeFileSync(join(repo, "app.txt"), "v1\nOLC-WORK\n");
  const before = commitCount(repo);
  assert.throws(
    () =>
      createCheckpoint({
        projectRoot: repo,
        config: wrong,
        taskId: "T-1",
        ownedPaths: ["app.txt"],
        snapshots: { "app.txt": "v1\nOLC-WORK\n" },
        summary: "x",
      }),
    (e: unknown) => e instanceof IdentityError,
  );
  assert.equal(commitCount(repo), before);
});

test("path outside the repo is refused with nothing staged", () => {
  const { repo, config } = setup();
  assert.throws(
    () =>
      createCheckpoint({
        projectRoot: repo,
        config,
        taskId: "T-1",
        ownedPaths: ["../evil.txt"],
        snapshots: { "../evil.txt": "x" },
        summary: "x",
      }),
    (e: unknown) => e instanceof CheckpointError && e.code === "PATH_OUTSIDE_REPO",
  );
  assert.equal(git(repo, "diff", "--cached", "--name-only"), "");
});
