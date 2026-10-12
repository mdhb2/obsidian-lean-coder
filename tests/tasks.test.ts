import { strict as assert } from "node:assert";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  TaskRegistryError,
  attachBranch,
  getTask,
  recommendResume,
  registerTask,
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

test("full lifecycle draft to done passes through review", () => {
  const vault = makeVault();
  registerTask(vault, "proj", "T-1", "feat", "d1");
  for (const [to, date] of [
    ["approved", "d2"],
    ["in_progress", "d3"],
    ["review", "d4"],
    ["done", "d5"],
  ] as const) {
    setTaskStatus(vault, "proj", "T-1", to, date);
  }
  assert.equal(getTask(vault, "proj", "T-1")?.status, "done");
});

test("illegal jumps are rejected with allowed transitions listed", () => {
  const vault = makeVault();
  registerTask(vault, "proj", "T-1", "feat", "d1");
  const err = assertRegistryError(
    () => setTaskStatus(vault, "proj", "T-1", "done", "d2"),
    "INVALID_TRANSITION",
  );
  assert.match(err.message, /approved, rejected/);
  setTaskStatus(vault, "proj", "T-1", "approved", "d2");
  assertRegistryError(() => setTaskStatus(vault, "proj", "T-1", "done", "d3"), "INVALID_TRANSITION");
  setTaskStatus(vault, "proj", "T-1", "in_progress", "d3");
  assertRegistryError(() => setTaskStatus(vault, "proj", "T-1", "done", "d4"), "INVALID_TRANSITION");
});

test("done is terminal and blocked/rejected paths work", () => {
  const vault = makeVault();
  registerTask(vault, "proj", "T-1", "feat", "d1");
  setTaskStatus(vault, "proj", "T-1", "approved", "d2");
  setTaskStatus(vault, "proj", "T-1", "in_progress", "d3");
  setTaskStatus(vault, "proj", "T-1", "blocked", "d4");
  setTaskStatus(vault, "proj", "T-1", "in_progress", "d5");
  setTaskStatus(vault, "proj", "T-1", "review", "d6");
  setTaskStatus(vault, "proj", "T-1", "done", "d7");
  const err = assertRegistryError(
    () => setTaskStatus(vault, "proj", "T-1", "in_progress", "d8"),
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
  assertRegistryError(() => setTaskStatus(vault, "proj", "T-9", "approved", "d2"), "UNKNOWN_TASK");
  assertRegistryError(() => attachBranch(vault, "proj", "T-9", "x", "d2"), "UNKNOWN_TASK");
  assert.equal(getTask(vault, "proj", "T-9"), null);
});

test("resume recommends the most recent open task on the branch", () => {
  const vault = makeVault();
  registerTask(vault, "proj", "T-old", "feat", "d1");
  setTaskStatus(vault, "proj", "T-old", "approved", "d2");
  registerTask(vault, "proj", "T-new", "feat", "d3");
  setTaskStatus(vault, "proj", "T-new", "approved", "d4");
  registerTask(vault, "proj", "T-other", "main", "d5");
  const rec = recommendResume(vault, "proj", "feat");
  assert.equal(rec.taskId, "T-new");
  assert.match(rec.note, /Confirm/);
  // Stale done task never wins over an open one.
  setTaskStatus(vault, "proj", "T-new", "in_progress", "d6");
  setTaskStatus(vault, "proj", "T-new", "review", "d7");
  setTaskStatus(vault, "proj", "T-new", "done", "d8");
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
