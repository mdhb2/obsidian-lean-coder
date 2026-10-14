import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import type { ResolvedConfig } from "../src/config/index.js";
import { IdentityError } from "../src/core/project-identity.js";
import { logEvent } from "../src/log/index.js";
import { draftTaskDocs } from "../src/planning/index.js";
import { buildResumeContext } from "../src/resume/index.js";
import { registerTask, setTaskStatus } from "../src/tasks/index.js";
import { resolveVaultDoc, writeVaultDoc } from "../src/vault/index.js";

function git(dir: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
}

function makeRepo(branch = "main"): string {
  const dir = mkdtempSync(join(tmpdir(), "olc061-repo-"));
  git(dir, "init", "-q", "-b", branch);
  git(dir, "config", "user.email", "t@t.local");
  git(dir, "config", "user.name", "t");
  writeFileSync(join(dir, "f.txt"), "x\n");
  git(dir, "add", ".");
  git(dir, "commit", "-qm", "init");
  return dir;
}

function makeVault(repo: string, projectId = "proj"): string {
  const dir = mkdtempSync(join(tmpdir(), "olc061-vault-"));
  mkdirSync(join(dir, "OLC"), { recursive: true });
  writeFileSync(
    join(dir, "OLC", "registry.json"),
    JSON.stringify({ projects: { [projectId]: { repoRoot: repo } } }),
  );
  return dir;
}

function configFor(vaultRoot: string, projectId = "proj"): ResolvedConfig {
  return { schemaVersion: 1, projectId, vaultPath: vaultRoot };
}

const INTENT = { what: "w", why: "y", nonGoals: "n", openQuestions: "q" };
const PLAN = { approach: "a", steps: "s", acceptanceCriteria: "c", tests: "t", risks: "r" };

function seedTask(vault: string, taskId: string, branch: string, date: string): void {
  registerTask(vault, "proj", taskId, branch, date);
  draftTaskDocs(vault, "proj", taskId, INTENT, PLAN);
}

test("clean interruption surfaces state, task, docs, events, checkpoint", () => {
  const repo = makeRepo();
  const head = git(repo, "rev-parse", "HEAD");
  const vault = makeVault(repo);
  const config = configFor(vault);
  writeVaultDoc(resolveVaultDoc(vault, "proj", "current-state.md"), "# State\n\nWorking on T1.\n");
  seedTask(vault, "T1", "main", "2026-10-12T10:00:00.000Z");
  setTaskStatus(vault, "proj", "T1", "active", "2026-10-12T10:01:00.000Z");
  logEvent({ projectRoot: repo, config, event: { kind: "session", summary: "did stuff", date: "2026-10-12T10:02:00.000Z" } });
  logEvent({ projectRoot: repo, config, event: { kind: "verify", summary: "tests green", date: "2026-10-12T10:03:00.000Z" } });
  logEvent({ projectRoot: repo, config, event: { kind: "checkpoint", summary: "cp1", taskId: "T1", gitSha: head, date: "2026-10-12T10:04:00.000Z" } });

  const ctx = buildResumeContext({ projectRoot: repo, config });
  assert.equal(ctx.branch, "main");
  assert.equal(ctx.head, head);
  assert.deepEqual(ctx.staged, []);
  assert.deepEqual(ctx.unstaged, []);
  assert.deepEqual(ctx.untracked, []);
  assert.match(ctx.currentState ?? "", /Working on T1/);
  assert.equal(ctx.openTasks.length, 1);
  assert.equal(ctx.openTasks[0].taskId, "T1");
  assert.equal(ctx.recommendedTaskId, "T1");
  assert.ok(ctx.recommendationNote.includes("T1"));
  assert.deepEqual(ctx.taskDocs, { intent: "draft", plan: "draft" });
  assert.equal(ctx.lastEvents[0].kind, "checkpoint");
  assert.equal(ctx.lastCheckpoint?.gitSha, head);
  assert.equal(ctx.lastCheckpoint?.taskId, "T1");
  assert.equal(ctx.needsConfirmation, true);
  assert.equal(ctx.blocked, null);
});

test("uncommitted changes are surfaced, recommendation still works", () => {
  const repo = makeRepo();
  const vault = makeVault(repo);
  const config = configFor(vault);
  seedTask(vault, "T1", "main", "2026-10-12T10:00:00.000Z");
  writeFileSync(join(repo, "f.txt"), "changed\n");
  writeFileSync(join(repo, "scratch.txt"), "notes\n");

  const ctx = buildResumeContext({ projectRoot: repo, config });
  assert.deepEqual(ctx.unstaged, ["f.txt"]);
  assert.deepEqual(ctx.untracked, ["scratch.txt"]);
  assert.equal(ctx.recommendedTaskId, "T1");
  assert.equal(ctx.needsConfirmation, true);
  assert.equal(ctx.blocked, null);
});

test("detached HEAD blocks but keeps vault-side context", () => {
  const repo = makeRepo();
  const vault = makeVault(repo);
  const config = configFor(vault);
  seedTask(vault, "T1", "main", "2026-10-12T10:00:00.000Z");
  writeVaultDoc(resolveVaultDoc(vault, "proj", "current-state.md"), "# State\n\nHello.\n");
  git(repo, "checkout", "-q", "--detach", "HEAD");

  const ctx = buildResumeContext({ projectRoot: repo, config });
  assert.equal(ctx.branch, null);
  assert.match(ctx.head, /^[0-9a-f]{40}$/);
  assert.equal(ctx.recommendedTaskId, null);
  assert.match(ctx.currentState ?? "", /Hello/);
  assert.ok(ctx.blocked !== null && ctx.blocked.includes("detached"));
  assert.equal(ctx.needsConfirmation, true);
});

test("two unfinished tasks recommend the most recently active", () => {
  const repo = makeRepo();
  const vault = makeVault(repo);
  seedTask(vault, "T1", "main", "2026-10-12T10:00:00.000Z");
  seedTask(vault, "T2", "main", "2026-10-12T11:00:00.000Z");

  const ctx = buildResumeContext({ projectRoot: repo, config: configFor(vault) });
  assert.equal(ctx.openTasks.length, 2);
  assert.equal(ctx.openTasks[0].taskId, "T2");
  assert.equal(ctx.recommendedTaskId, "T2");
  assert.equal(ctx.blocked, null);
});

test("equally recent tasks on one branch block for a choice", () => {
  const repo = makeRepo();
  const vault = makeVault(repo);
  const same = "2026-10-12T10:00:00.000Z";
  seedTask(vault, "T1", "main", same);
  seedTask(vault, "T2", "main", same);

  const ctx = buildResumeContext({ projectRoot: repo, config: configFor(vault) });
  assert.ok(ctx.blocked !== null && ctx.blocked.includes("T1") && ctx.blocked.includes("T2"));
  assert.equal(ctx.needsConfirmation, true);
});

test("unavailable vault fails before anything is read", () => {
  const repo = makeRepo();
  const missing = resolve(join(tmpdir(), "olc061-nope"));
  const config = configFor(missing);
  try {
    buildResumeContext({ projectRoot: repo, config });
  } catch (error) {
    assert.ok(error instanceof IdentityError, `expected IdentityError, got ${error}`);
    assert.equal(error.code, "VAULT_UNAVAILABLE");
    return;
  }
  assert.fail("expected IdentityError to be thrown");
});
