/**
 * OLC-041 — test/report/escalation behavior.
 *
 * Evidence-backed verification for one task frame:
 * - `runCheck` executes a single command (no shell) and captures the real
 *   outcome. Outcomes are NEVER invented: a spawn error, timeout, or
 *   non-zero exit is recorded as-is and counts as failure.
 * - `verifyChecks` re-runs failing checks up to `maxAttempts` (bounded
 *   retry) and records EVERY attempt, so the report shows what actually ran.
 * - `completeTaskWithVerification` runs the checks first and only delegates
 *   to OLC-040 `completeTask` when all pass; otherwise it returns
 *   `verify-failed` and leaves the registry untouched (caller stops and
 *   reports — the escalation path). Scope/architecture changes still require
 *   plan revision via OLC-034; this module never widens scope by itself.
 */

import { spawnSync } from "node:child_process";

import { completeTask, type BuildFrame } from "../build/index.js";
import type { ResolvedConfig } from "../config/index.js";

export interface CheckSpec {
  /** Human-readable name shown in the report (e.g. "unit tests"). */
  name: string;
  /** Executable + args. Run directly with no shell. */
  command: string[];
  /** Per-attempt wall-clock budget. Default 120_000. */
  timeoutMs?: number;
}

export interface CheckAttempt {
  attempt: number;
  /** Process exit code; null when the process never ran or was killed. */
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  /** Human-readable spawn failure (e.g. ENOENT). Absent on normal runs. */
  error?: string;
  durationMs: number;
  ok: boolean;
}

export interface CheckResult {
  name: string;
  command: string[];
  ok: boolean;
  attempts: CheckAttempt[];
}

export interface VerifyOutcome {
  ok: boolean;
  results: CheckResult[];
  /** Names of checks still failing after all attempts (the escalation list). */
  escalated: string[];
}

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_CHARS = 20_000;

function clip(s: string): string {
  return s.length > MAX_OUTPUT_CHARS ? s.slice(0, MAX_OUTPUT_CHARS) + "\n…(truncated)" : s;
}

/** Execute one check attempt. Never throws for check failures; only for programmer errors. */
export function runCheck(spec: CheckSpec, cwd: string, attempt = 1): CheckAttempt {
  const started = Date.now();
  type PartialAttempt = Omit<CheckAttempt, "durationMs" | "ok">;
  const base: PartialAttempt = {
    attempt,
    exitCode: null,
    stdout: "",
    stderr: "",
    timedOut: false,
  };
  let result: PartialAttempt;
  try {
    const [cmd, ...args] = spec.command;
    if (!cmd) {
      result = { ...base, error: "empty command" };
    } else {
      const spawned = spawnSync(cmd, args, {
        cwd,
        timeout: spec.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
        shell: false,
      });
      const err = spawned.error as (Error & { code?: string }) | undefined;
      if (err) {
        result = {
          ...base,
          stdout: clip(String(spawned.stdout ?? "")),
          stderr: clip(String(spawned.stderr ?? "")),
          timedOut: err.code === "ETIMEDOUT",
          error: `${err.code ?? err.name}: ${err.message}`,
        };
      } else {
        result = {
          ...base,
          exitCode: spawned.status,
          stdout: clip(String(spawned.stdout ?? "")),
          stderr: clip(String(spawned.stderr ?? "")),
        };
      }
    }
  } catch (error) {
    result = { ...base, error: `runner error: ${(error as Error).message}` };
  }
  const durationMs = Date.now() - started;
  return { ...result, durationMs, ok: result.exitCode === 0 && !result.error };
}

/**
 * Run every check, retrying failures up to `maxAttempts` total attempts per
 * check (bounded: `maxAttempts: 1` means no retry). Every attempt is kept.
 */
export function verifyChecks(
  specs: CheckSpec[],
  cwd: string,
  options?: { maxAttempts?: number },
): VerifyOutcome {
  const maxAttempts = Math.max(1, Math.floor(options?.maxAttempts ?? 1));
  const results: CheckResult[] = specs.map((spec) => {
    const attempts: CheckAttempt[] = [runCheck(spec, cwd, 1)];
    while (!attempts[attempts.length - 1]!.ok && attempts.length < maxAttempts) {
      attempts.push(runCheck(spec, cwd, attempts.length + 1));
    }
    return {
      name: spec.name,
      command: spec.command,
      ok: attempts[attempts.length - 1]!.ok,
      attempts,
    };
  });
  return {
    ok: results.every((r) => r.ok),
    results,
    escalated: results.filter((r) => !r.ok).map((r) => r.name),
  };
}

/** Render the outcome as Markdown (for history.md / session reports). */
export function formatVerifyReport(outcome: VerifyOutcome): string {
  const lines = [
    "## verification",
    "",
    `Result: ${outcome.ok ? "PASS" : "FAIL"} (${outcome.results.filter((r) => r.ok).length}/${outcome.results.length} checks passed)`,
    "",
  ];
  for (const r of outcome.results) {
    lines.push(`### ${r.name} — ${r.ok ? "PASS" : "FAIL"} (${r.attempts.length} attempt(s))`);
    lines.push(`\`$ ${r.command.join(" ")}\``);
    for (const a of r.attempts) {
      lines.push(
        `- attempt ${a.attempt}: exit=${a.exitCode === null ? "n/a" : a.exitCode}` +
          (a.timedOut ? " TIMED OUT" : "") +
          (a.error ? ` error=${a.error}` : "") +
          ` (${a.durationMs}ms)`,
      );
      if (a.stdout.trim() !== "") lines.push(`  stdout: ${a.stdout.trim().split("\n").slice(-5).join(" | ")}`);
      if (a.stderr.trim() !== "") lines.push(`  stderr: ${a.stderr.trim().split("\n").slice(-5).join(" | ")}`);
    }
    lines.push("");
  }
  if (!outcome.ok) {
    lines.push(`Escalated (needs user guidance, no auto-retry left): ${outcome.escalated.join(", ")}`);
    lines.push("");
  }
  return lines.join("\n");
}

export type CompleteWithVerificationResult =
  | { verified: true; changed: string[] }
  | { verified: false; status: "verify-failed"; outcome: VerifyOutcome; report: string };

/**
 * Verify first, complete only on pass. On failure the task registry is left
 * untouched (still active) and the caller must stop + report the
 * outcome (escalation) instead of claiming success.
 */
export function completeTaskWithVerification(
  frame: BuildFrame,
  config: ResolvedConfig,
  repoRoot: string,
  checks: CheckSpec[],
  options?: { maxAttempts?: number; date?: string },
): CompleteWithVerificationResult {
  const outcome = verifyChecks(checks, repoRoot, { maxAttempts: options?.maxAttempts });
  if (!outcome.ok) {
    return { verified: false, status: "verify-failed", outcome, report: formatVerifyReport(outcome) };
  }
  return { verified: true, ...completeTask(frame, config, repoRoot, options?.date) };
}
