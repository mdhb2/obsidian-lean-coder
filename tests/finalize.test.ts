import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { ResolvedConfig } from "../src/config/index.js";
import { FinalizeError, finalizeTask } from "../src/finalize/index.js";
import { logEvent } from "../src/log/index.js";
import { draftTaskDocs } from "../src/planning/index.js";
import { getTask, registerSubtask, registerTask, setTaskStatus } from "../src/tasks/index.js";

const DATE = "2026-10-13T09:00:00.000Z";

function git(dir: string, ...args: string[]): void {
  execFileSync("git", args, { cwd: dir });
}

function setup(): { repo: string; vault: string; config: ResolvedConfig } {
  const repo = mkdtempSync(join(tmpdir(), "olcfinal-repo-"));
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.email", "t@t.local");
  git(repo, "config", "user.name", "t");
  writeFileSync(join(repo, "app.txt"), "v1\n");
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "init");
  const vault = mkdtempSync(join(tmpdir(), "olcfinal-vault-"));
  mkdirSync(join(vault, "OLC"), { recursive: true });
  writeFileSync(
    join(vault, "OLC", "registry.json"),
    JSON.stringify({ projects: { proj: { repoRoot: repo } } }),
  );
  return { repo, vault, config: { schemaVersion: 1, projectId: "proj", vaultPath: vault } };
}

function seedTask(vault: string, taskId = "T-1"): void {
  registerTask(vault, "proj", taskId, "main", DATE);
  setTaskStatus(vault, "proj", taskId, "active", DATE);
  draftTaskDocs(
    vault,
    "proj",
    taskId,
    { what: "Build the widget.", why: "Users need it.", nonGoals: "n", openQuestions: "q" },
    { approach: "a", steps: "s", acceptanceCriteria: "c", tests: "t", risks: "r" },
  );
}

function assertFinalizeError(fn: () => unknown, code: string): FinalizeError {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof FinalizeError, `expected FinalizeError, got ${error}`);
    assert.equal(error.code, code);
    return error;
  }
  assert.fail("expected FinalizeError to be thrown");
}

test("finalize writes knowledge, moves the folder, marks done, logs the event", () => {
  const { repo, vault, config } = setup();
  seedTask(vault);
  logEvent({
    projectRoot: repo,
    config,
    event: { kind: "checkpoint", summary: "widget checkpoint", taskId: "T-1", gitSha: "abc123", date: DATE },
  });
  const out = finalizeTask({ projectRoot: repo, config, taskId: "T-1", highlights: "Shipped on time.", date: DATE });
  assert.equal(out.taskId, "T-1");
  const knowledge = readFileSync(out.knowledgeFile, "utf8");
  assert.match(knowledge, /Build the widget/);
  assert.match(knowledge, /abc123/);
  assert.match(knowledge, /Shipped on time/);
  assert.ok(!knowledge.includes("{{"), "no placeholder may survive");
  assert.ok(existsSync(join(vault, "OLC", "Projects", "proj", "tasks", "done", "T-1", "intent.md")));
  assert.ok(!existsSync(join(vault, "OLC", "Projects", "proj", "tasks", "active", "T-1")));
  assert.equal(getTask(vault, "proj", "T-1")?.status, "done");
  const dayLog = readFileSync(join(vault, "OLC", "Projects", "proj", "logs", "2026-10-13.md"), "utf8");
  assert.match(dayLog, /Task T-1 selesai dan difinalisasi/);
  // Log graph stays unbroken: every terkait link now points at tasks/done/.
  assert.match(dayLog, /\[\[\.\.\/tasks\/done\/T-1\/intent\]\]/);
  assert.ok(!dayLog.includes("tasks/active/T-1/"), "no stale active/ links remain in the log");
  assert.ok(out.linksRewritten >= 1);
});

test("finalize refuses unknown, draft, and already-done tasks", () => {
  const { repo, config } = setup();
  assertFinalizeError(() => finalizeTask({ projectRoot: repo, config, taskId: "ghost", date: DATE }), "UNKNOWN_TASK");
  registerTask(config.vaultPath, "proj", "T-draft", "main", DATE);
  assertFinalizeError(() => finalizeTask({ projectRoot: repo, config, taskId: "T-draft", date: DATE }), "NOT_FINALIZABLE");
  seedTask(config.vaultPath, "T-done");
  finalizeTask({ projectRoot: repo, config, taskId: "T-done", date: DATE });
  assertFinalizeError(() => finalizeTask({ projectRoot: repo, config, taskId: "T-done", date: DATE }), "NOT_FINALIZABLE");
});

test("finalize refuses sub-tasks and parents with open sub-tasks", () => {
  const { repo, vault, config } = setup();
  seedTask(vault, "T-1");
  registerSubtask(vault, "proj", "T-1", "T-1a", null, DATE);
  assertFinalizeError(() => finalizeTask({ projectRoot: repo, config, taskId: "T-1a", date: DATE }), "NOT_FINALIZABLE");
  const err = assertFinalizeError(() => finalizeTask({ projectRoot: repo, config, taskId: "T-1", date: DATE }), "OPEN_SUBTASKS");
  assert.match(err.message, /T-1a/);
  setTaskStatus(vault, "proj", "T-1a", "active", DATE);
  setTaskStatus(vault, "proj", "T-1a", "done", DATE);
  draftTaskDocs(
    vault,
    "proj",
    "T-1a",
    { what: "Sub work.", why: "Needed.", nonGoals: "n", openQuestions: "q" },
    { approach: "a", steps: "s", acceptanceCriteria: "c", tests: "t", risks: "r" },
  );
  const out = finalizeTask({ projectRoot: repo, config, taskId: "T-1", date: DATE });
  assert.ok(existsSync(join(out.taskDir, "sub", "T-1a")), "sub-task moves along with its parent");
});
