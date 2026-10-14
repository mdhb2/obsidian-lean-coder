/**
 * intent.md / plan.md workflow (OLC-032).
 *
 * - `draftTaskDocs`: render both templates (status `draft`) and create them
 *   under `tasks/<taskId>/`. Refuses when docs already exist.
 * - `approveTaskDocs`: flip both statuses to `approved` (explicit overwrite).
 * - `reviseTaskDocs`: append the reason to `history.md`, write updated docs,
 *   reset status to `draft` (re-approval required).
 * - `rejectTaskDocs`: mark both `rejected` and record the reason in history.
 * - `assertApproved`: gate for build-side use — throws unless BOTH docs exist
 *   and are `approved`, naming the offending document.
 */

import { join } from "node:path";

import {
  resolveTaskDir,
} from "../tasks/index.js";
import {
  VaultError,
  parseFrontmatter,
  readVaultDoc,
  renderTemplate,
  withFrontmatter,
  writeVaultDoc,
} from "../vault/index.js";

export type PlanningStatus = "draft" | "approved" | "rejected";

export class PlanningError extends Error {
  readonly code: "NOT_APPROVED" | "MISSING_DOC" | "INVALID_STATUS";
  constructor(
    code: "NOT_APPROVED" | "MISSING_DOC" | "INVALID_STATUS",
    message: string,
  ) {
    super(message);
    this.name = "PlanningError";
    this.code = code;
  }
}

export interface IntentVars {
  what: string;
  why: string;
  nonGoals: string;
  openQuestions: string;
}

export interface PlanVars {
  approach: string;
  steps: string;
  acceptanceCriteria: string;
  tests: string;
  risks: string;
}

function docPaths(vaultRoot: string, projectId: string, taskId: string) {
  const dir = resolveTaskDir(vaultRoot, projectId, taskId);
  return {
    intent: join(dir, "intent.md"),
    plan: join(dir, "plan.md"),
    history: join(dir, "history.md"),
  };
}

function templateVars(
  projectId: string,
  taskId: string,
  status: PlanningStatus,
  extra: Record<string, string>,
): Record<string, string> {
  return { project_id: projectId, task_id: taskId, status, ...extra };
}

/** Create both docs with status `draft`. Throws (no overwrite) if either exists. */
export function draftTaskDocs(
  vaultRoot: string,
  projectId: string,
  taskId: string,
  intent: IntentVars,
  plan: PlanVars,
): { intentPath: string; planPath: string } {
  const paths = docPaths(vaultRoot, projectId, taskId);
  const intentText = renderTemplate(
    "intent",
    templateVars(projectId, taskId, "draft", {
      what: intent.what,
      why: intent.why,
      non_goals: intent.nonGoals,
      open_questions: intent.openQuestions,
    }),
  );
  const planText = renderTemplate(
    "plan",
    templateVars(projectId, taskId, "draft", {
      approach: plan.approach,
      steps: plan.steps,
      acceptance_criteria: plan.acceptanceCriteria,
      tests: plan.tests,
      risks: plan.risks,
    }),
  );
  // Write plan first so a failure leaves either both-missing or plan-only;
  // either way no partial intent exists without its plan. Both use
  // create-only semantics (existing docs are never silently replaced).
  writeVaultDoc(paths.plan, planText);
  try {
    writeVaultDoc(paths.intent, intentText);
  } catch (error) {
    if (error instanceof VaultError && error.code === "ALREADY_EXISTS") {
      throw new PlanningError(
        "NOT_APPROVED",
        `Cannot draft task ${taskId}: intent.md already exists and plan.md was just created. ` +
          "Remove the stray plan.md or revise the existing docs instead — nothing was overwritten.",
      );
    }
    throw error;
  }
  return { intentPath: paths.intent, planPath: paths.plan };
}

function readStatus(path: string, label: string): PlanningStatus {
  let text: string;
  try {
    text = readVaultDoc(path);
  } catch {
    throw new PlanningError(
      "MISSING_DOC",
      `Planning document missing: ${label} at ${path}. Draft it before approving.`,
    );
  }
  const status = parseFrontmatter(text).data["status"];
  if (status !== "draft" && status !== "approved" && status !== "rejected") {
    throw new PlanningError(
      "INVALID_STATUS",
      `Planning document ${label} has unknown status ${JSON.stringify(status)}. Expected draft, approved, or rejected.`,
    );
  }
  return status;
}

/** Current statuses of both docs (`missing` when the file does not exist). */
export function getDocStatuses(
  vaultRoot: string,
  projectId: string,
  taskId: string,
): { intent: PlanningStatus | "missing"; plan: PlanningStatus | "missing" } {
  const paths = docPaths(vaultRoot, projectId, taskId);
  const read = (path: string, label: string): PlanningStatus | "missing" => {
    try {
      return readStatus(path, label);
    } catch (error) {
      if (error instanceof PlanningError && error.code === "MISSING_DOC") return "missing";
      throw error;
    }
  };
  return { intent: read(paths.intent, "intent.md"), plan: read(paths.plan, "plan.md") };
}

function setStatus(
  vaultRoot: string,
  projectId: string,
  taskId: string,
  status: PlanningStatus,
): void {
  const paths = docPaths(vaultRoot, projectId, taskId);
  for (const [path, label] of [
    [paths.intent, "intent.md"],
    [paths.plan, "plan.md"],
  ] as const) {
    const parsed = parseFrontmatter(readVaultDoc(path));
    writeVaultDoc(path, withFrontmatter({ ...parsed.data, status }, parsed.body), {
      overwrite: true,
    });
  }
}

function appendHistory(
  vaultRoot: string,
  projectId: string,
  taskId: string,
  kind: string,
  reason: string,
  date: string,
): void {
  const { history } = docPaths(vaultRoot, projectId, taskId);
  let existing = "";
  try {
    existing = readVaultDoc(history);
  } catch {
    existing = "";
  }
  const entry = `## ${date} — ${kind}\n\n${reason}\n`;
  const header =
    `# History — ${taskId}\n\n## Terkait\n\n` +
    `- [[../${taskId}/intent]] — maksud kerja\n` +
    `- [[../${taskId}/plan]] — rencana kerja\n\n`;
  writeVaultDoc(history, existing === "" ? `${header}${entry}` : `${existing}\n${entry}`, {
    overwrite: true,
  });
}

/** Approve both docs. Both must currently exist (draft or rejected). */
export function approveTaskDocs(
  vaultRoot: string,
  projectId: string,
  taskId: string,
  date: string,
): void {
  const paths = docPaths(vaultRoot, projectId, taskId);
  readStatus(paths.intent, "intent.md");
  readStatus(paths.plan, "plan.md");
  setStatus(vaultRoot, projectId, taskId, "approved");
  appendHistory(vaultRoot, projectId, taskId, "approved", "Approved by user.", date);
}

/**
 * Revise: record the reason in history, optionally replace doc bodies,
 * reset both statuses to `draft` so re-approval is required.
 */
export function reviseTaskDocs(
  vaultRoot: string,
  projectId: string,
  taskId: string,
  reason: string,
  date: string,
  updated?: { intent?: IntentVars; plan?: PlanVars },
): void {
  appendHistory(vaultRoot, projectId, taskId, "revision", reason, date);
  if (updated?.intent) {
    const paths = docPaths(vaultRoot, projectId, taskId);
    writeVaultDoc(
      paths.intent,
      renderTemplate(
        "intent",
        templateVars(projectId, taskId, "draft", {
          what: updated.intent.what,
          why: updated.intent.why,
          non_goals: updated.intent.nonGoals,
          open_questions: updated.intent.openQuestions,
        }),
      ),
      { overwrite: true },
    );
  }
  if (updated?.plan) {
    const paths = docPaths(vaultRoot, projectId, taskId);
    writeVaultDoc(
      paths.plan,
      renderTemplate(
        "plan",
        templateVars(projectId, taskId, "draft", {
          approach: updated.plan.approach,
          steps: updated.plan.steps,
          acceptance_criteria: updated.plan.acceptanceCriteria,
          tests: updated.plan.tests,
          risks: updated.plan.risks,
        }),
      ),
      { overwrite: true },
    );
  }
  setStatus(vaultRoot, projectId, taskId, "draft");
}

/** Reject both docs and record the reason. A rejected plan blocks builds. */
export function rejectTaskDocs(
  vaultRoot: string,
  projectId: string,
  taskId: string,
  reason: string,
  date: string,
): void {
  const paths = docPaths(vaultRoot, projectId, taskId);
  readStatus(paths.intent, "intent.md");
  readStatus(paths.plan, "plan.md");
  setStatus(vaultRoot, projectId, taskId, "rejected");
  appendHistory(vaultRoot, projectId, taskId, "rejected", reason, date);
}

/**
 * Build gate: throws `PlanningError(NOT_APPROVED)` unless both docs exist
 * and carry status `approved`. Call before any implementation work.
 */
export function assertApproved(vaultRoot: string, projectId: string, taskId: string): void {
  const statuses = getDocStatuses(vaultRoot, projectId, taskId);
  const problems: string[] = [];
  for (const [label, status] of [
    ["intent.md", statuses.intent],
    ["plan.md", statuses.plan],
  ] as const) {
    if (status !== "approved") problems.push(`${label} is ${status}`);
  }
  if (problems.length > 0) {
    throw new PlanningError(
      "NOT_APPROVED",
      `Task ${taskId} is not approved for implementation: ${problems.join("; ")}. ` +
        "Draft, revise, and get both documents approved before coding.",
    );
  }
}
