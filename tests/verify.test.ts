import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { beginTask } from "../src/build/index.js";
import type { ResolvedConfig } from "../src/config/index.js";
import { approveTaskDocs, draftTaskDocs } from "../src/planning/index.js";
import { getTask, registerTask, setTaskStatus } from "../src/tasks/index.js";
import {
  completeTaskWithVerification,
  formatVerifyReport,
  runCheck,
  verifyChecks,
} from "../src/verify/index.js";

const DATE = "2026-10-12";
const NODE = process.execPath;

function git(dir: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
}

function setup(taskId: string): { repo: string; config: ResolvedConfig } {
  const repo = mkdtempSync(join(tmpdir(), "olc041-repo-"));
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.email", "t@t.local");
  git(repo, "config", "user.name", "t");
  writeFileSync(join(repo, "app.txt"), "v1\n");
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "init");
  const vault = mkdtempSync(join(tmpdir(), "olc041-vault-"));
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
  setTaskStatus(vault, "proj", taskId, "approved", DATE);
  approveTaskDocs(vault, "proj", taskId, DATE);
  const config: ResolvedConfig = { schemaVersion: 1, projectId: "proj", vaultPath: vault };
  return { repo, config };
}

test("passing check records a real exit-0 attempt", () => {
  const cwd = mkdtempSync(join(tmpdir(), "olc041-cwd-"));
  const attempt = runCheck({ name: "pass", command: [NODE, "-e", "process.exit(0)"] }, cwd);
  assert.equal(attempt.ok, true);
  assert.equal(attempt.exitCode, 0);
  assert.equal(attempt.error, undefined);
  assert.equal(attempt.timedOut, false);
});

test("failing check retries bounded times and escalates", () => {
  const cwd = mkdtempSync(join(tmpdir(), "olc041-cwd-"));
  const outcome = verifyChecks(
    [{ name: "fails", command: [NODE, "-e", "process.exit(3)"] }],
    cwd,
    { maxAttempts: 3 },
  );
  assert.equal(outcome.ok, false);
  assert.deepEqual(outcome.escalated, ["fails"]);
  assert.equal(outcome.results[0]!.attempts.length, 3);
  assert.ok(outcome.results[0]!.attempts.every((a) => a.exitCode === 3 && !a.ok));
});

test("missing executable is a recorded failure, never a pass or throw", () => {
  const cwd = mkdtempSync(join(tmpdir(), "olc041-cwd-"));
  const outcome = verifyChecks(
    [{ name: "ghost", command: ["olc-no-such-binary-xyz"] }],
    cwd,
  );
  assert.equal(outcome.ok, false);
  const attempt = outcome.results[0]!.attempts[0]!;
  assert.match(attempt.error ?? "", /ENOENT/);
});

test("overrunning check times out and is killed", () => {
  const cwd = mkdtempSync(join(tmpdir(), "olc041-cwd-"));
  const attempt = runCheck(
    { name: "slow", command: [NODE, "-e", "setTimeout(()=>{},30000)"], timeoutMs: 300 },
    cwd,
  );
  assert.equal(attempt.ok, false);
  assert.equal(attempt.timedOut, true);
});

test("report contains only real captured output", () => {
  const cwd = mkdtempSync(join(tmpdir(), "olc041-cwd-"));
  const outcome = verifyChecks(
    [
      {
        name: "echoer",
        command: [NODE, "-e", "console.log('hello-out-123'); console.error('hello-err-456')"],
      },
      { name: "boom", command: [NODE, "-e", "process.exit(1)"] },
    ],
    cwd,
    { maxAttempts: 2 },
  );
  const report = formatVerifyReport(outcome);
  assert.match(report, /FAIL/);
  assert.match(report, /hello-out-123/);
  assert.match(report, /hello-err-456/);
  assert.match(report, /Escalated.*boom/);
  assert.equal(outcome.results[1]!.attempts.length, 2);
});

test("failed verification leaves the registry untouched", () => {
  const { repo, config } = setup("t-verify-fail");
  const frame = beginTask({ config, taskId: "t-verify-fail", startDir: repo, touchPaths: ["app.txt"], date: DATE });
  writeFileSync(join(repo, "app.txt"), "v2\n");
  const result = completeTaskWithVerification(frame, config, repo, [
    { name: "broken", command: [NODE, "-e", "process.exit(1)"] },
  ]);
  assert.equal(result.verified, false);
  if (result.verified) return;
  assert.equal(result.status, "verify-failed");
  assert.match(result.report, /FAIL/);
  assert.equal(getTask(config.vaultPath, "proj", "t-verify-fail")!.status, "in_progress");
});

test("passed verification delegates to completion", () => {
  const { repo, config } = setup("t-verify-pass");
  const frame = beginTask({ config, taskId: "t-verify-pass", startDir: repo, touchPaths: ["app.txt"], date: DATE });
  writeFileSync(join(repo, "app.txt"), "v2\n");
  const result = completeTaskWithVerification(frame, config, repo, [
    { name: "unit", command: [NODE, "-e", "process.exit(0)"] },
  ]);
  assert.equal(result.verified, true);
  if (!result.verified) return;
  assert.deepEqual(result.changed, ["app.txt"]);
  assert.equal(getTask(config.vaultPath, "proj", "t-verify-pass")!.status, "review");
});
