import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  TaskRegistryError,
  attachBranch,
  getTask,
  listOpenTasks,
  migrateTaskLayout,
  recommendNext,
  recommendResume,
  registerSubtask,
  registerTask,
  resolveTaskDir,
  setTaskStatus,
} from "../src/tasks/index.js";

function makeVault(): string {
  return mkdtempSync(join(tmpdir(), "olc033-"));
}

function assertRegistryError(fn: () => unknown, code: string): TaskRegistryError {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof TaskRegistryError, `expected TaskRegistryError, got ${error}`);
    assert.equal(error.code, code);
    return error;
  }
  assert.fail("expected TaskRegistryError to be thrown");
}

test("full lifecycle draft to done passes through active", () => {
  const vault = makeVault();
  registerTask(vault, "proj", "T-1", "feat", "d1");
  setTaskStatus(vault, "proj", "T-1", "active", "d2");
  setTaskStatus(vault, "proj", "T-1", "pending", "d3");
  setTaskStatus(vault, "proj", "T-1", "active", "d4");
  setTaskStatus(vault, "proj", "T-1", "done", "d5");
  assert.equal(getTask(vault, "proj", "T-1")?.status, "done");
});

test("illegal jumps are rejected with allowed transitions listed", () => {
  const vault = makeVault();
  registerTask(vault, "proj", "T-1", "feat", "d1");
  const err = assertRegistryError(
    () => setTaskStatus(vault, "proj", "T-1", "done", "d2"),
    "INVALID_TRANSITION",
  );
  assert.match(err.message, /active, rejected/);
  setTaskStatus(vault, "proj", "T-1", "active", "d2");
  assertRegistryError(() => setTaskStatus(vault, "proj", "T-1", "draft", "d3"), "INVALID_TRANSITION");
  assertRegistryError(() => setTaskStatus(vault, "proj", "T-1", "rejected", "d3"), "INVALID_TRANSITION");
});

test("done is terminal and rejected paths work", () => {
  const vault = makeVault();
  registerTask(vault, "proj", "T-1", "feat", "d1");
  setTaskStatus(vault, "proj", "T-1", "active", "d2");
  setTaskStatus(vault, "proj", "T-1", "pending", "d3");
  setTaskStatus(vault, "proj", "T-1", "done", "d4");
  const err = assertRegistryError(
    () => setTaskStatus(vault, "proj", "T-1", "active", "d5"),
    "INVALID_TRANSITION",
  );
  assert.match(err.message, /terminal/);
  registerTask(vault, "proj", "T-2", null, "d1");
  setTaskStatus(vault, "proj", "T-2", "rejected", "d2");
  setTaskStatus(vault, "proj", "T-2", "draft", "d3");
  assert.equal(getTask(vault, "proj", "T-2")?.status, "draft");
});

test("duplicate registration and unknown tasks error clearly", () => {
  const vault = makeVault();
  registerTask(vault, "proj", "T-1", "feat", "d1");
  assertRegistryError(() => registerTask(vault, "proj", "T-1", "feat", "d2"), "ALREADY_REGISTERED");
  assert.equal(getTask(vault, "proj", "T-1")?.updatedAt, "d1");
  assertRegistryError(() => setTaskStatus(vault, "proj", "T-9", "active", "d2"), "UNKNOWN_TASK");
  assertRegistryError(() => attachBranch(vault, "proj", "T-9", "x", "d2"), "UNKNOWN_TASK");
  assert.equal(getTask(vault, "proj", "T-9"), null);
});

test("resume recommends the most recent open task on the branch", () => {
  const vault = makeVault();
  registerTask(vault, "proj", "T-old", "feat", "d1");
  setTaskStatus(vault, "proj", "T-old", "active", "d2");
  registerTask(vault, "proj", "T-new", "feat", "d3");
  setTaskStatus(vault, "proj", "T-new", "active", "d4");
  registerTask(vault, "proj", "T-other", "main", "d5");
  const rec = recommendResume(vault, "proj", "feat");
  assert.equal(rec.taskId, "T-new");
  assert.match(rec.note, /Confirm/);
  // Stale done task never wins over an open one.
  setTaskStatus(vault, "proj", "T-new", "done", "d6");
  const rec2 = recommendResume(vault, "proj", "feat");
  assert.equal(rec2.taskId, "T-old");
});

test("resume on unknown branch or empty registry asks the user", () => {
  const vault = makeVault();
  const noBranch = recommendResume(vault, "proj", null);
  assert.equal(noBranch.taskId, null);
  assert.match(noBranch.note, /unknown/i);
  const empty = recommendResume(vault, "proj", "feat");
  assert.equal(empty.taskId, null);
  assert.match(empty.note, /No tasks are registered/);
  registerTask(vault, "proj", "T-1", "main", "d1");
  const elsewhere = recommendResume(vault, "proj", "feat");
  assert.equal(elsewhere.taskId, null);
  assert.match(elsewhere.note, /No open tasks are attached to branch feat/);
});

test("next-task prefers the branch, then falls back to newest overall", () => {
  const vault = makeVault();
  assert.match(recommendNext(vault, "proj", "feat").note, /No tasks are registered/);
  registerTask(vault, "proj", "T-old", "feat", "d1");
  setTaskStatus(vault, "proj", "T-old", "active", "d2");
  setTaskStatus(vault, "proj", "T-old", "pending", "d3");
  registerTask(vault, "proj", "T-new", "main", "d4");
  setTaskStatus(vault, "proj", "T-new", "active", "d5");
  assert.equal(recommendNext(vault, "proj", "feat").taskId, "T-old");
  const fallback = recommendNext(vault, "proj", "other");
  assert.equal(fallback.taskId, "T-new");
  assert.match(fallback.note, /overall/);
  setTaskStatus(vault, "proj", "T-old", "done", "d5");
  setTaskStatus(vault, "proj", "T-new", "done", "d6");
  assert.equal(recommendNext(vault, "proj", "feat").taskId, null);
  assert.match(recommendNext(vault, "proj", "feat").note, /No open tasks remain/);
});

test("listOpenTasks returns newest first, excluding done and rejected", () => {
  const vault = makeVault();
  registerTask(vault, "proj", "T-1", "feat", "d1");
  registerTask(vault, "proj", "T-2", "feat", "d2");
  registerTask(vault, "proj", "T-3", "feat", "d3");
  setTaskStatus(vault, "proj", "T-1", "active", "d4");
  setTaskStatus(vault, "proj", "T-2", "rejected", "d5");
  setTaskStatus(vault, "proj", "T-3", "active", "d6");
  setTaskStatus(vault, "proj", "T-3", "done", "d7");
  const open = listOpenTasks(vault, "proj");
  assert.deepEqual(open.map((t) => t.taskId), ["T-1"]);
});

test("sub-tasks register one level deep and resolve under the parent", () => {
  const vault = makeVault();
  registerTask(vault, "proj", "T-1", "feat", "d1");
  const sub = registerSubtask(vault, "proj", "T-1", "T-1a", null, "d2");
  assert.equal(sub.status, "draft");
  assert.equal(sub.parent, "T-1");
  assert.equal(sub.branch, "feat");
  assert.equal(
    resolveTaskDir(vault, "proj", "T-1a"),
    join(vault, "OLC", "Projects", "proj", "tasks", "active", "T-1", "sub", "T-1a"),
  );
  assert.equal(
    resolveTaskDir(vault, "proj", "T-1"),
    join(vault, "OLC", "Projects", "proj", "tasks", "active", "T-1"),
  );
  // No deeper nesting: a sub-task cannot be a parent.
  assertRegistryError(() => registerSubtask(vault, "proj", "T-1a", "T-1a1", null, "d3"), "INVALID_TRANSITION");
  // Unknown parent and duplicates fail loudly.
  assertRegistryError(() => registerSubtask(vault, "proj", "ghost", "T-x", null, "d3"), "UNKNOWN_TASK");
  assertRegistryError(() => registerSubtask(vault, "proj", "T-1", "T-1a", null, "d3"), "ALREADY_REGISTERED");
});

test("sub-tasks cannot be added to done parents", () => {
  const vault = makeVault();
  registerTask(vault, "proj", "T-1", "feat", "d1");
  setTaskStatus(vault, "proj", "T-1", "active", "d2");
  setTaskStatus(vault, "proj", "T-1", "done", "d3");
  assertRegistryError(() => registerSubtask(vault, "proj", "T-1", "T-1a", null, "d4"), "INVALID_TRANSITION");
});

test("migration maps old statuses and moves folders into active/done", () => {
  const vault = makeVault();
  mkdirSync(join(vault, "OLC", "Projects", "proj", "tasks", "T-1"), { recursive: true });
  writeFileSync(join(vault, "OLC", "Projects", "proj", "tasks", "T-1", "intent.md"), "old\n");
  mkdirSync(join(vault, "OLC", "Projects", "proj", "tasks", "T-2"), { recursive: true });
  writeFileSync(
    join(vault, "OLC", "Projects", "proj", "tasks", "registry.json"),
    JSON.stringify({
      tasks: {
        "T-1": { status: "in_progress", branch: "feat", updatedAt: "d1" },
        "T-2": { status: "blocked", branch: "feat", updatedAt: "d2" },
      },
    }),
  );
  const report = migrateTaskLayout(vault, "proj");
  assert.equal(report.migrated, true);
  assert.equal(getTask(vault, "proj", "T-1")?.status, "active");
  assert.equal(getTask(vault, "proj", "T-2")?.status, "pending");
  assert.ok(existsSync(join(vault, "OLC", "Projects", "proj", "tasks", "active", "T-1", "intent.md")));
  assert.ok(!existsSync(join(vault, "OLC", "Projects", "proj", "tasks", "T-1")));
  // Second run is a no-op.
  const again = migrateTaskLayout(vault, "proj");
  assert.equal(again.migrated, false);
});
