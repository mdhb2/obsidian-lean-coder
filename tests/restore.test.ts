import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { ResolvedConfig } from "../src/config/index.js";
import { createCheckpoint } from "../src/git/checkpoint.js";
import { RestoreError, restoreCheckpoint } from "../src/git/restore.js";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).replace(/\s+$/, "");
}

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "olc052-repo-"));
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
  const dir = mkdtempSync(join(tmpdir(), "olc052-vault-"));
  mkdirSync(join(dir, "OLC"), { recursive: true });
  writeFileSync(
    join(dir, "OLC", "registry.json"),
    JSON.stringify({ projects: { [projectId]: { repoRoot } } }),
  );
  return dir;
}

function setup(projectId = "proj"): { repo: string; config: ResolvedConfig } {
  const repo = makeRepo();
  const vault = makeVault(projectId, repo);
  const config: ResolvedConfig = { schemaVersion: 1, projectId, vaultPath: vault };
  return { repo, config };
}

function checkpoint(
  repo: string,
  config: ResolvedConfig,
  taskId: string,
  content: string,
  summary: string,
): string {
  writeFileSync(join(repo, "app.txt"), content);
  const result = createCheckpoint({
    projectRoot: repo,
    config,
    taskId,
    ownedPaths: ["app.txt"],
    snapshots: { "app.txt": content },
    summary,
    date: "2026-10-12T00:00:00.000Z",
  });
  assert.equal(result.status, "committed");
  if (result.status !== "committed") throw new Error("fixture checkpoint failed");
  return result.sha;
}

function commitCount(repo: string): string {
  return git(repo, "rev-list", "--count", "HEAD");
}

function commitFiles(repo: string): string[] {
  const out = git(repo, "show", "--name-only", "--pretty=format:", "HEAD");
  return out === "" ? [] : out.split("\n");
}

function expectRestoreError(fn: () => unknown, code: string): void {
  assert.throws(
    fn,
    (e: unknown) => e instanceof RestoreError && e.code === code,
  );
}

test("three checkpoints: restore cp2 from cp3 keeps history, matches cp2, protects user files", () => {
  const { repo, config } = setup();
  checkpoint(repo, config, "T-1", "v1\nOLC-1\n", "cp1");
  const cp2 = checkpoint(repo, config, "T-1", "v1\nOLC-2\n", "cp2");
  checkpoint(repo, config, "T-1", "v1\nOLC-3\n", "cp3");
  writeFileSync(join(repo, "user.txt"), "USER-EDIT\nuser base\n");
  writeFileSync(join(repo, "notes.txt"), "scratch\n");

  const result = restoreCheckpoint({
    projectRoot: repo,
    config,
    taskId: "T-1",
    checkpointSha: cp2,
    restorePaths: ["app.txt"],
    reason: "v3 approach rejected, back to v2",
    date: "2026-10-12T01:00:00.000Z",
  });

  assert.equal(result.status, "restored");
  assert.equal(result.restoredFrom, cp2);
  assert.deepEqual(result.restoredPaths, ["app.txt"]);
  assert.equal(commitCount(repo), "5", "init + 3 checkpoints + restore commit");
  assert.equal(readFileSync(join(repo, "app.txt"), "utf8"), "v1\nOLC-2\n");
  git(repo, "merge-base", "--is-ancestor", cp2, "HEAD");
  assert.ok(git(repo, "log", "--pretty=%H").split("\n").includes(cp2), "cp2 still reachable");
  assert.deepEqual(commitFiles(repo), ["app.txt"]);
  assert.match(git(repo, "log", "-1", "--pretty=%B"), /olc restore: T-1/);
  assert.equal(readFileSync(join(repo, "user.txt"), "utf8"), "USER-EDIT\nuser base\n");
  assert.equal(readFileSync(join(repo, "notes.txt"), "utf8"), "scratch\n");
  assert.ok(result.sha, "new commit sha present");
  assert.ok(result.recordPath, "record path present");
  const record = readFileSync(result.recordPath as string, "utf8");
  assert.ok(record.includes(result.sha as string), "record cross-refs the restore commit");
  assert.ok(record.includes(cp2.slice(0, 12)), "record cross-refs the restored checkpoint");
});

test("unknown SHA aborts with zero mutation", () => {
  const { repo, config } = setup();
  const cp1 = checkpoint(repo, config, "T-1", "v1\nOLC-1\n", "cp1");
  void cp1;
  const before = commitCount(repo);
  expectRestoreError(
    () =>
      restoreCheckpoint({
        projectRoot: repo,
        config,
        taskId: "T-1",
        checkpointSha: "deadbee",
        restorePaths: ["app.txt"],
        reason: "x",
      }),
    "UNKNOWN_CHECKPOINT",
  );
  assert.equal(commitCount(repo), before);
});

test("non-ancestor commit aborts (later history must stay reachable)", () => {
  const { repo, config } = setup();
  checkpoint(repo, config, "T-1", "v1\nOLC-1\n", "cp1");
  git(repo, "checkout", "-qb", "side");
  writeFileSync(join(repo, "side.txt"), "side\n");
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "side work");
  const sideSha = git(repo, "rev-parse", "HEAD");
  git(repo, "checkout", "-q", "main");
  const before = commitCount(repo);
  expectRestoreError(
    () =>
      restoreCheckpoint({
        projectRoot: repo,
        config,
        taskId: "T-1",
        checkpointSha: sideSha,
        restorePaths: ["side.txt"],
        reason: "x",
      }),
    "NOT_ANCESTOR",
  );
  assert.equal(commitCount(repo), before);
});

test("path absent at checkpoint aborts (no delete/create on restore)", () => {
  const { repo, config } = setup();
  const cp1 = checkpoint(repo, config, "T-1", "v1\nOLC-1\n", "cp1");
  writeFileSync(join(repo, "new.txt"), "new\n");
  const r = createCheckpoint({
    projectRoot: repo,
    config,
    taskId: "T-1",
    ownedPaths: ["new.txt"],
    snapshots: { "new.txt": "new\n" },
    summary: "cp2",
  });
  assert.equal(r.status, "committed");
  const before = commitCount(repo);
  expectRestoreError(
    () =>
      restoreCheckpoint({
        projectRoot: repo,
        config,
        taskId: "T-1",
        checkpointSha: cp1,
        restorePaths: ["new.txt"],
        reason: "x",
      }),
    "PATH_NOT_IN_CHECKPOINT",
  );
  assert.equal(commitCount(repo), before);
  assert.equal(readFileSync(join(repo, "new.txt"), "utf8"), "new\n");
});

test("uncommitted edit on intended path aborts and content is preserved", () => {
  const { repo, config } = setup();
  const cp1 = checkpoint(repo, config, "T-1", "v1\nOLC-1\n", "cp1");
  writeFileSync(join(repo, "app.txt"), "v1\nUSER-TWEAK\n");
  const before = commitCount(repo);
  expectRestoreError(
    () =>
      restoreCheckpoint({
        projectRoot: repo,
        config,
        taskId: "T-1",
        checkpointSha: cp1,
        restorePaths: ["app.txt"],
        reason: "x",
      }),
    "UNSTAGED_RISK",
  );
  assert.equal(commitCount(repo), before);
  assert.equal(readFileSync(join(repo, "app.txt"), "utf8"), "v1\nUSER-TWEAK\n");
});

test("pre-staged intended path aborts", () => {
  const { repo, config } = setup();
  const cp1 = checkpoint(repo, config, "T-1", "v1\nOLC-1\n", "cp1");
  writeFileSync(join(repo, "app.txt"), "v1\ntweak\n");
  git(repo, "add", "--", "app.txt");
  const before = commitCount(repo);
  expectRestoreError(
    () =>
      restoreCheckpoint({
        projectRoot: repo,
        config,
        taskId: "T-1",
        checkpointSha: cp1,
        restorePaths: ["app.txt"],
        reason: "x",
      }),
    "RESTORE_PATH_PRESTAGED",
  );
  assert.equal(commitCount(repo), before);
  git(repo, "reset", "-q");
});

test("untracked same-name file aborts and scratch is preserved", () => {
  const { repo, config } = setup();
  const cp1 = checkpoint(repo, config, "T-1", "v1\nOLC-1\n", "cp1");
  git(repo, "rm", "-q", "app.txt");
  git(repo, "commit", "-qm", "user removes app");
  writeFileSync(join(repo, "app.txt"), "scratch idea\n");
  assert.equal(git(repo, "status", "--porcelain=v1", "-uall"), "?? app.txt");
  const before = commitCount(repo);
  expectRestoreError(
    () =>
      restoreCheckpoint({
        projectRoot: repo,
        config,
        taskId: "T-1",
        checkpointSha: cp1,
        restorePaths: ["app.txt"],
        reason: "x",
      }),
    "UNTRACKED_RISK",
  );
  assert.equal(commitCount(repo), before);
  assert.equal(readFileSync(join(repo, "app.txt"), "utf8"), "scratch idea\n");
});

test("foreign staged change survives; already-matching content is a no-op", () => {
  const { repo, config } = setup();
  const cp1 = checkpoint(repo, config, "T-1", "v1\nOLC-1\n", "cp1");
  const cp2 = checkpoint(repo, config, "T-1", "v1\nOLC-2\n", "cp2");
  checkpoint(repo, config, "T-1", "v1\nOLC-3\n", "cp3");
  writeFileSync(join(repo, "user.txt"), "STAGED-USER\nuser base\n");
  git(repo, "add", "--", "user.txt");

  const result = restoreCheckpoint({
    projectRoot: repo,
    config,
    taskId: "T-1",
    checkpointSha: cp2,
    restorePaths: ["app.txt"],
    reason: "back to v2",
  });
  assert.equal(result.status, "restored");
  assert.deepEqual(commitFiles(repo), ["app.txt"]);
  assert.equal(
    git(repo, "diff", "--cached", "--name-only"),
    "user.txt",
    "foreign staged change survives",
  );

  const countBeforeNoop = commitCount(repo);
  const noop = restoreCheckpoint({
    projectRoot: repo,
    config,
    taskId: "T-1",
    checkpointSha: cp2,
    restorePaths: ["app.txt"],
    reason: "already at v2",
  });
  assert.equal(noop.status, "already-matches");
  assert.equal(noop.sha, undefined, "no commit on no-op");
  assert.equal(commitCount(repo), countBeforeNoop);
  assert.equal(
    git(repo, "diff", "--cached", "--name-only"),
    "user.txt",
    "foreign staged change still survives",
  );
  git(repo, "reset", "-q");
});
