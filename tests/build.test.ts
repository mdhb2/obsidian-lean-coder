import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { ResolvedConfig } from "../src/config/index.js";
import {
  BuildError,
  beginTask,
  changedPaths,
  completeTask,
} from "../src/build/index.js";
import { approveTaskDocs, draftTaskDocs } from "../src/planning/index.js";
import { getTask, registerTask, setTaskStatus } from "../src/tasks/index.js";

const DATE = "2026-10-12";

function git(dir: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
}

function setup(taskId: string, approved: boolean): { repo: string; vault: string; config: ResolvedConfig } {
  const repo = mkdtempSync(join(tmpdir(), "olc040-repo-"));
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.email", "t@t.local");
  git(repo, "config", "user.name", "t");
  writeFileSync(join(repo, "app.txt"), "v1\n");
  writeFileSync(join(repo, "other.txt"), "other\n");
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "init");
  const vault = mkdtempSync(join(tmpdir(), "olc040-vault-"));
  mkdirSync(join(vault, "OLC"), { recursive: true });
  writeFileSync(
    join(vault, "OLC", "registry.json"),
    JSON.stringify({ projects: { proj: { repoRoot: repo } } }),
  );
  registerTask(vault, "proj", taskId, "main", DATE);
  draftTaskDocs(
    vault,
    "proj",
    taskId,
    { what: "w", why: "y", nonGoals: "n", openQuestions: "q" },
    { approach: "a", steps: "s", acceptanceCriteria: "c", tests: "t", risks: "r" },
  );
  if (approved) {
    setTaskStatus(vault, "proj", taskId, "approved", DATE);
    approveTaskDocs(vault, "proj", taskId, DATE);
  }
  const config: ResolvedConfig = { schemaVersion: 1, projectId: "proj", vaultPath: vault };
  return { repo, vault, config };
}

function assertBuildError(fn: () => unknown, code: string): BuildError {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof BuildError, `expected BuildError, got ${error}`);
    assert.equal(error.code, code);
    assert.ok(error.message.length > 20, "message should be actionable");
    return error;
  }
  assert.fail("expected BuildError to be thrown");
}

test("begin is blocked without approval", () => {
  const { repo, config } = setup("t-draft", false);
  const err = assertBuildError(
    () => beginTask({ config, taskId: "t-draft", startDir: repo, date: DATE }),
    "NOT_READY",
  );
  assert.match(err.message, /not approved/i);
});

test("begin is blocked on identity mismatch", () => {
  const { vault } = setup("t-mismatch", true);
  const elsewhere = mkdtempSync(join(tmpdir(), "olc040-else-"));
  git(elsewhere, "init", "-q", "-b", "main");
  git(elsewhere, "config", "user.email", "t@t.local");
  git(elsewhere, "config", "user.name", "t");
  writeFileSync(join(elsewhere, "mine.txt"), "x\n");
  git(elsewhere, "add", ".");
  git(elsewhere, "commit", "-qm", "init");
  const config: ResolvedConfig = { schemaVersion: 1, projectId: "proj", vaultPath: vault };
  const err = assertBuildError(
    () => beginTask({ config, taskId: "t-mismatch", startDir: elsewhere, date: DATE }),
    "CONTEXT_MISMATCH",
  );
  assert.match(err.message, /different repository/);
});

test("begin returns a scoped frame and moves approved to in_progress", () => {
  const { repo, vault, config } = setup("t-begin", true);
  const frame = beginTask({ config, taskId: "t-begin", touchPaths: ["app.txt"], startDir: repo, date: DATE });
  assert.deepEqual(Object.keys(frame).sort(), [
    "baseHead",
    "declaredPaths",
    "intentBody",
    "planBody",
    "startedAt",
    "taskId",
  ]);
  assert.match(frame.intentBody, /w/);
  assert.match(frame.planBody, /acceptance/i);
  assert.deepEqual(frame.declaredPaths, ["app.txt"]);
  assert.equal(frame.baseHead, git(repo, "rev-parse", "HEAD"));
  assert.equal(getTask(vault, "proj", "t-begin")?.status, "in_progress");
});

test("clean completion moves task to review", () => {
  const { repo, config } = setup("t-clean", true);
  const frame = beginTask({ config, taskId: "t-clean", touchPaths: ["app.txt"], startDir: repo, date: DATE });
  writeFileSync(join(repo, "app.txt"), "v2\n");
  const result = completeTask(frame, config, repo, DATE);
  assert.deepEqual(result.changed, ["app.txt"]);
  assert.equal(getTask(config.vaultPath, "proj", "t-clean")?.status, "review");
});

test("undeclared tracked edit blocks completion and names the file", () => {
  const { repo, config } = setup("t-scope", true);
  const frame = beginTask({ config, taskId: "t-scope", touchPaths: ["app.txt"], startDir: repo, date: DATE });
  writeFileSync(join(repo, "app.txt"), "v2\n");
  writeFileSync(join(repo, "other.txt"), "hijacked\n");
  const err = assertBuildError(() => completeTask(frame, config, repo, DATE), "SCOPE_CHANGED");
  assert.deepEqual(err.details, ["other.txt"]);
  assert.match(err.message, /plan revision/);
  assert.equal(getTask(config.vaultPath, "proj", "t-scope")?.status, "in_progress");
});

test("undeclared new file blocks completion", () => {
  const { repo, config } = setup("t-new", true);
  const frame = beginTask({ config, taskId: "t-new", touchPaths: [], startDir: repo, date: DATE });
  writeFileSync(join(repo, "scratch.txt"), "oops\n");
  assert.deepEqual(changedPaths(repo), ["scratch.txt"]);
  assertBuildError(() => completeTask(frame, config, repo, DATE), "SCOPE_CHANGED");
  assert.equal(getTask(config.vaultPath, "proj", "t-new")?.status, "in_progress");
});

