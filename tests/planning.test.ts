import { strict as assert } from "node:assert";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  PlanningError,
  approveTaskDocs,
  assertApproved,
  draftTaskDocs,
  getDocStatuses,
  rejectTaskDocs,
  reviseTaskDocs,
  type IntentVars,
  type PlanVars,
} from "../src/planning/index.js";
import { parseFrontmatter, readVaultDoc } from "../src/vault/index.js";

const DATE = "2026-10-12";

const INTENT: IntentVars = {
  what: "do X",
  why: "because Y",
  nonGoals: "not Z",
  openQuestions: "none",
};
const PLAN: PlanVars = {
  approach: "small steps",
  steps: "1. a\n2. b",
  acceptanceCriteria: "works",
  tests: "unit",
  risks: "low",
};

function makeVault(): string {
  return mkdtempSync(join(tmpdir(), "olc032-"));
}

function assertPlanningError(fn: () => unknown, code: string): PlanningError {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof PlanningError, `expected PlanningError, got ${error}`);
    assert.equal(error.code, code);
    return error;
  }
  assert.fail("expected PlanningError to be thrown");
}

test("draft creates both docs with draft status", () => {
  const vault = makeVault();
  const { intentPath, planPath } = draftTaskDocs(vault, "proj", "T-1", INTENT, PLAN);
  assert.deepEqual(getDocStatuses(vault, "proj", "T-1"), { intent: "draft", plan: "draft" });
  assert.ok(parseFrontmatter(readVaultDoc(intentPath)).body.includes("do X"));
  assert.ok(parseFrontmatter(readVaultDoc(planPath)).body.includes("small steps"));
});

test("draft twice does not silently replace", () => {
  const vault = makeVault();
  draftTaskDocs(vault, "proj", "T-1", INTENT, PLAN);
  const before = readVaultDoc(join(vault, "OLC", "Projects", "proj", "tasks", "active", "T-1", "plan.md"));
  try {
    draftTaskDocs(vault, "proj", "T-1", INTENT, PLAN);
    assert.fail("expected second draft to throw");
  } catch (error) {
    assert.ok(error instanceof Error);
  }
  assert.equal(readVaultDoc(join(vault, "OLC", "Projects", "proj", "tasks", "active", "T-1", "plan.md")), before);
});

test("gate blocks implementation before approval, passes after", () => {
  const vault = makeVault();
  draftTaskDocs(vault, "proj", "T-1", INTENT, PLAN);
  const err = assertPlanningError(() => assertApproved(vault, "proj", "T-1"), "NOT_APPROVED");
  assert.match(err.message, /intent\.md is draft/);
  approveTaskDocs(vault, "proj", "T-1", DATE);
  assert.deepEqual(getDocStatuses(vault, "proj", "T-1"), {
    intent: "approved",
    plan: "approved",
  });
  assertApproved(vault, "proj", "T-1");
});

test("revision preserves history and requires re-approval", () => {
  const vault = makeVault();
  draftTaskDocs(vault, "proj", "T-1", INTENT, PLAN);
  approveTaskDocs(vault, "proj", "T-1", DATE);
  reviseTaskDocs(vault, "proj", "T-1", "Scope grew: also handle Z.", DATE, {
    plan: { ...PLAN, risks: "medium now" },
  });
  assert.deepEqual(getDocStatuses(vault, "proj", "T-1"), { intent: "draft", plan: "draft" });
  assertPlanningError(() => assertApproved(vault, "proj", "T-1"), "NOT_APPROVED");
  const history = readVaultDoc(join(vault, "OLC", "Projects", "proj", "tasks", "active", "T-1", "history.md"));
  assert.ok(history.includes("Scope grew: also handle Z."));
  assert.ok(history.includes("approved"), "approval event is preserved in history");
  assert.ok(readVaultDoc(join(vault, "OLC", "Projects", "proj", "tasks", "active", "T-1", "plan.md")).includes("medium now"));
  approveTaskDocs(vault, "proj", "T-1", DATE);
  assertApproved(vault, "proj", "T-1");
});

test("rejected plan blocks the gate and records the reason", () => {
  const vault = makeVault();
  draftTaskDocs(vault, "proj", "T-1", INTENT, PLAN);
  rejectTaskDocs(vault, "proj", "T-1", "Wrong direction entirely.", DATE);
  assert.deepEqual(getDocStatuses(vault, "proj", "T-1"), {
    intent: "rejected",
    plan: "rejected",
  });
  const err = assertPlanningError(() => assertApproved(vault, "proj", "T-1"), "NOT_APPROVED");
  assert.match(err.message, /rejected/);
  const history = readVaultDoc(join(vault, "OLC", "Projects", "proj", "tasks", "active", "T-1", "history.md"));
  assert.ok(history.includes("Wrong direction entirely."));
});

test("approving or gating missing docs reports clearly", () => {
  const vault = makeVault();
  assert.deepEqual(getDocStatuses(vault, "proj", "T-9"), { intent: "missing", plan: "missing" });
  const err = assertPlanningError(() => assertApproved(vault, "proj", "T-9"), "NOT_APPROVED");
  assert.match(err.message, /missing/);
  assertPlanningError(() => approveTaskDocs(vault, "proj", "T-9", DATE), "MISSING_DOC");
});
