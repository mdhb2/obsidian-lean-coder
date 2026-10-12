/**
 * Session-start and pre-operation vault/project validation (OLC-065).
 *
 * Catches a missing/mismatched vault before OLC damages the wrong context.
 * Lightweight by construction: every check reuses OLC-021 `validateIdentity`,
 * which reads only git metadata (`rev-parse`) plus the single small
 * `OLC/registry.json` file and a vault accessibility probe (`readdirSync`).
 * The whole vault is never scanned.
 *
 * - `startSession` — call once at session start. Throws (IdentityError)
 *   before anything is read or written when the repo, vault, or registration
 *   is wrong.
 * - `assertContextCurrent` — call before critical read/write/commit/restore
 *   operations. Re-runs the same cheap gate (catches a vault unmounted or
 *   a registry rewritten *between* operations) and additionally blocks on
 *   drift: the repo root or branch no longer matches the session start
 *   (branch switched mid-session), which always needs user confirmation.
 *
 * Identity problems propagate as `IdentityError` unchanged; drift is a
 * `ValidationError(SESSION_DRIFT)`. Both block the operation with zero
 * writes.
 */

import { resolve } from "node:path";

import type { ResolvedConfig } from "../config/index.js";
import { validateIdentity } from "../core/project-identity.js";

export type ValidationErrorCode = "SESSION_DRIFT";

export class ValidationError extends Error {
  readonly code: ValidationErrorCode;
  constructor(code: ValidationErrorCode, message: string) {
    super(message);
    this.name = "ValidationError";
    this.code = code;
  }
}

export interface SessionContext {
  repoRoot: string;
  branch: string;
  projectId: string;
  vaultRoot: string;
  startedAt: string;
}

export interface SessionStartInput {
  /** Any directory inside the project (identity resolution starts here). */
  projectRoot: string;
  config: ResolvedConfig;
  /** Defaults to current time (pass explicit dates in tests). */
  date?: string;
}

export interface RevalidateInput extends SessionStartInput {
  /** Context captured by `startSession`; drift against it blocks. */
  session: SessionContext;
}

/**
 * Session-start gate. Returns the validated context to keep and pass to
 * `assertContextCurrent` before later critical operations.
 */
export function startSession(input: SessionStartInput): SessionContext {
  const identity = validateIdentity(input.projectRoot, input.config);
  return {
    repoRoot: identity.repoRoot,
    branch: identity.branch,
    projectId: identity.projectId,
    vaultRoot: identity.vaultRoot,
    startedAt: input.date ?? new Date().toISOString(),
  };
}

/**
 * Pre-operation revalidation. Re-runs the cheap identity gate (a vault
 * unmounted, deleted, or re-registered between operations throws here,
 * before the critical op touches anything) and blocks when the repo root
 * or branch drifted since session start.
 */
export function assertContextCurrent(input: RevalidateInput): SessionContext {
  const now = validateIdentity(input.projectRoot, input.config);
  if (resolve(now.repoRoot) !== resolve(input.session.repoRoot)) {
    throw new ValidationError(
      "SESSION_DRIFT",
      `Refusing operation: repository root changed since session start ` +
        `(was ${input.session.repoRoot}, now ${now.repoRoot}). ` +
        "Confirm which checkout this work belongs to before continuing — nothing was read or written.",
    );
  }
  if (now.branch !== input.session.branch) {
    throw new ValidationError(
      "SESSION_DRIFT",
      `Refusing operation: branch changed since session start ` +
        `(was ${input.session.branch}, now ${now.branch}). ` +
        "Confirm which branch and task this work belongs to before continuing — nothing was switched or closed.",
    );
  }
  return {
    repoRoot: now.repoRoot,
    branch: now.branch,
    projectId: now.projectId,
    vaultRoot: now.vaultRoot,
    startedAt: input.session.startedAt,
  };
}
