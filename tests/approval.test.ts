import { strict as assert } from "node:assert";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  ApprovalError,
  assertBuildReady,
  requestScopeChange,
  resumeAfterRevision,
} from "../src/approval/index.js";
import { approveTaskDocs, draftTaskDocs, getDocStatuses } from "../src/planning/index.js";
import { getTask, registerTask, resolveTaskDir, setTaskStatus } from "../src/tasks/index.js";
import { readVaultDoc } from "../src/vault/index.js";

const DATE = "2026-10-12";

function setupTask(taskId: string, branch: string | null = "main"): string {
  const vault = mkdtempSync(join(tmpdir(), "olc034-"));
  registerTask(vault, "proj", taskId, branch, DATE);
  draftTaskDocs(
    vault,
    "proj",
    taskId,
    { what: "w", why: "y", nonGoals: "n", openQuestions: "q" },
    { approach: "a", steps: "s", acceptanceCriteria: "c", tests: "t", risks: "r" },
  );
  return vault;
}

function readBody(vault: string, taskId: string, doc: string): string {
  return readVaultDoc(join(resolveTaskDir(vault, "proj", taskId), doc));
}

function assertApprovalError(fn: () => unknown, code: string): ApprovalError {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof ApprovalError, `expected ApprovalError, got ${error}`);
    assert.equal(error.code, code);
    return error;
  }
  assert.fail("expected ApprovalError to be thrown");
}

test("no approval: draft docs block the build gate", () => {
  const vault = setupTask("t-no-approval");
  const err = assertApprovalError(() => assertBuildReady(vault, "proj", "t-no-approval"), "NOT_APPROVED");
  assert.match(err.message, /draft/);
});

test("registry draft with approved docs still blocks (cross-check)", () => {
  const vault = setupTask("t-cross");
  approveTaskDocs(vault, "proj", "t-cross", DATE);
  // Registry still draft while docs are approved → gate must refuse.
  const err = assertApprovalError(() => assertBuildReady(vault, "proj", "t-cross"), "NOT_APPROVED");
  assert.match(err.message, /registry status is draft/);
});

test("approved plan passes the build gate when active or pending", () => {
  const vault = setupTask("t-ok");
  setTaskStatus(vault, "proj", "t-ok", "active", DATE);
  approveTaskDocs(vault, "proj", "t-ok", DATE);
  assertBuildReady(vault, "proj", "t-ok");
  setTaskStatus(vault, "proj", "t-ok", "pending", DATE);
  assertBuildReady(vault, "proj", "t-ok");
});

test("revision request parks the task without touching approved bodies", () => {
  const vault = setupTask("t-scope");
  setTaskStatus(vault, "proj", "t-scope", "active", DATE);
  approveTaskDocs(vault, "proj", "t-scope", DATE);
  const beforeIntent = readBody(vault, "t-scope", "intent.md");
  const beforePlan = readBody(vault, "t-scope", "plan.md");
  const moved = requestScopeChange(vault, "proj", "t-scope", "user wants Postgres instead", DATE);
  assert.deepEqual(moved, { registryFrom: "active", registryTo: "pending" });
  assert.equal(getTask(vault, "proj", "t-scope")?.status, "pending");
  assert.deepEqual(getDocStatuses(vault, "proj", "t-scope"), { intent: "draft", plan: "draft" });
  // Bodies byte-identical: the approved plan was NOT silently replaced.
  const stripStatus = (text: string): string => text.replace(/^status: .*$/m, "");
  assert.equal(stripStatus(readBody(vault, "t-scope", "intent.md")), stripStatus(beforeIntent));
  assert.equal(stripStatus(readBody(vault, "t-scope", "plan.md")), stripStatus(beforePlan));
  const history = readBody(vault, "t-scope", "history.md");
  assert.match(history, /SCOPE CHANGE requested: user wants Postgres instead/);
  assert.match(history, /checkpoint/);
  // Gate now refuses until re-approval.
  assertApprovalError(() => assertBuildReady(vault, "proj", "t-scope"), "NOT_APPROVED");
});

test("scope change from pending stays parked, resume restores execution", () => {
  const vault = setupTask("t-resume");
  setTaskStatus(vault, "proj", "t-resume", "active", DATE);
  approveTaskDocs(vault, "proj", "t-resume", DATE);
  setTaskStatus(vault, "proj", "t-resume", "pending", DATE);
  const moved = requestScopeChange(vault, "proj", "t-resume", "API shape changed", DATE);
  assert.deepEqual(moved, { registryFrom: "pending", registryTo: "pending" });
  assertApprovalError(() => assertBuildReady(vault, "proj", "t-resume"), "NOT_APPROVED");
  const resumed = resumeAfterRevision(vault, "proj", "t-resume", DATE);
  assert.deepEqual(resumed, { registryFrom: "pending", registryTo: "active" });
  assert.deepEqual(getDocStatuses(vault, "proj", "t-resume"), {
    intent: "approved",
    plan: "approved",
  });
  assertBuildReady(vault, "proj", "t-resume");
});

test("scope change and resume reject invalid states", () => {
  const vault = setupTask("t-invalid");
  // Never approved → no scope to change.
  assertApprovalError(
    () => requestScopeChange(vault, "proj", "t-invalid", "x", DATE),
    "INVALID_STATE",
  );
  // Unknown task.
  assertApprovalError(() => requestScopeChange(vault, "proj", "nope", "x", DATE), "INVALID_STATE");
  assertApprovalError(() => resumeAfterRevision(vault, "proj", "nope", DATE), "INVALID_STATE");
  // Active but never parked → nothing to resume.
  setTaskStatus(vault, "proj", "t-invalid", "active", DATE);
  approveTaskDocs(vault, "proj", "t-invalid", DATE);
  assertApprovalError(() => resumeAfterRevision(vault, "proj", "t-invalid", DATE), "INVALID_STATE");
  // Double scope change while parked → already parked.
  requestScopeChange(vault, "proj", "t-invalid", "first", DATE);
  assertApprovalError(
    () => requestScopeChange(vault, "proj", "t-invalid", "second", DATE),
    "INVALID_STATE",
  );
});
