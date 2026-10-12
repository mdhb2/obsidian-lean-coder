import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { assertBuildReady } from "../src/approval/index.js";
import { BuildError, beginTask, completeTask } from "../src/build/index.js";
import type { ResolvedConfig } from "../src/config/index.js";
import { IdentityError } from "../src/core/project-identity.js";
import { createCheckpoint } from "../src/git/checkpoint.js";
import { restoreCheckpoint } from "../src/git/restore.js";
import { initProject } from "../src/init/index.js";
import { logEvent } from "../src/log/index.js";
import { approveTaskDocs, draftTaskDocs } from "../src/planning/index.js";
import { buildResumeContext } from "../src/resume/index.js";
import { buildSessionSummary } from "../src/session/index.js";
import { getTask, registerTask, setTaskStatus } from "../src/tasks/index.js";
import { getTasteRule, listTasteRules, proposeTasteRule, reviewTasteRule } from "../src/taste/index.js";
import { assertContextCurrent, startSession } from "../src/validation/index.js";
import { verifyChecks } from "../src/verify/index.js";
import { completeTaskWithVerification } from "../src/verify/index.js";

const NODE = process.execPath;
const DATE = "2026-10-12T10:00:00.000Z";
const INTENT = { what: "Tambah total belanja.", why: "Kasir butuh subtotal.", nonGoals: "Tanpa pajak.", openQuestions: "Tidak ada." };
const PLAN = { approach: "Fungsi murni.", steps: "Tulis fungsi + uji.", acceptanceCriteria: "Subtotal benar.", tests: "node -e.", risks: "Kecil." };

function git(dir: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
}

test("OLC-072 full MVP journey: init → plan → build → checkpoint → resume → restore → taste → summary", () => {
  // 1. INIT dummy app + vault.
  const repo = mkdtempSync(join(tmpdir(), "olc072-app-"));
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.email", "t@t.local");
  git(repo, "config", "user.name", "t");
  writeFileSync(join(repo, "app.txt"), "v1\n");
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "init");
  const vault = mkdtempSync(join(tmpdir(), "olc072-vault-"));
  const init = initProject({ projectRoot: repo, projectId: "shop", vaultPath: vault });
  assert.equal(init.status, "ready");
  assert.ok(existsSync(join(repo, ".olc", "config.json")));
  assert.ok(existsSync(join(vault, "OLC", "registry.json")));
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "olc init");
  const config: ResolvedConfig = { schemaVersion: 1, projectId: "shop", vaultPath: vault };
  const session = startSession({ projectRoot: repo, config, date: DATE });

  // 2. PLAN + APPROVE. Build before approval must be blocked.
  registerTask(vault, "shop", "T-1", "main", DATE);
  draftTaskDocs(vault, "shop", "T-1", INTENT, PLAN);
  assert.throws(() => beginTask({ config, taskId: "T-1", touchPaths: ["app.txt"], startDir: repo, date: DATE }), (e: unknown) => e instanceof BuildError && e.code === "NOT_READY");
  approveTaskDocs(vault, "shop", "T-1", DATE);
  setTaskStatus(vault, "shop", "T-1", "approved", DATE);
  assertBuildReady(vault, "shop", "T-1");

  // 3. BUILD + TEST. Out-of-scope completion must be blocked.
  const frame = beginTask({ config, taskId: "T-1", touchPaths: ["app.txt"], startDir: repo, date: DATE });
  assert.equal(getTask(vault, "shop", "T-1")?.status, "in_progress");
  writeFileSync(join(repo, "smuggled.txt"), "x\n");
  assert.throws(
    () => completeTaskWithVerification(frame, config, repo, [{ name: "smoke", command: [NODE, "-e", "process.exit(0)"] }], { date: DATE }),
    (e: unknown) => e instanceof BuildError && e.code === "SCOPE_CHANGED",
  );
  rmSync(join(repo, "smuggled.txt"));
  writeFileSync(join(repo, "app.txt"), "v2 subtotal\n");
  const done = completeTaskWithVerification(frame, config, repo, [{ name: "smoke", command: [NODE, "-e", "process.exit(0)"] }], { date: DATE });
  assert.equal(done.verified, true);
  assert.equal(getTask(vault, "shop", "T-1")?.status, "review");
  logEvent({ projectRoot: repo, config, event: { kind: "verify", summary: "smoke tests green for T-1", taskId: "T-1", date: DATE } });

  // 4. CHECKPOINT twice (second commit = later history to preserve).
  const v2 = readFileSync(join(repo, "app.txt"), "utf8");
  const cp1 = createCheckpoint({ projectRoot: repo, config, taskId: "T-1", ownedPaths: ["app.txt"], snapshots: { "app.txt": v2 }, summary: "subtotal done", session, date: DATE });
  assert.equal(cp1.status, "committed");
  const sha1 = (cp1 as { sha: string }).sha;
  logEvent({ projectRoot: repo, config, event: { kind: "checkpoint", summary: "checkpoint subtotal", taskId: "T-1", gitSha: sha1, date: DATE } });
  writeFileSync(join(repo, "app.txt"), "v3 discount\n");
  const v3 = readFileSync(join(repo, "app.txt"), "utf8");
  const cp2 = createCheckpoint({ projectRoot: repo, config, taskId: "T-1", ownedPaths: ["app.txt"], snapshots: { "app.txt": v3 }, summary: "discount done", session, date: DATE });
  assert.equal(cp2.status, "committed");
  const sha2 = (cp2 as { sha: string }).sha;
  logEvent({ projectRoot: repo, config, event: { kind: "checkpoint", summary: "checkpoint discount", taskId: "T-1", gitSha: sha2, date: DATE } });

  // 5. INTERRUPTION → RESUME with confirmation (read-only, nothing closed).
  const ctx = buildResumeContext({ projectRoot: repo, config, lastEventsLimit: 5 });
  assert.equal(ctx.needsConfirmation, true);
  assert.equal(ctx.lastCheckpoint?.gitSha, sha2);
  assert.ok(ctx.openTasks.some((t) => t.taskId === "T-1"));
  assert.ok(ctx.lastEvents.some((e) => e.summary.includes("smoke tests green")));
  const still = assertContextCurrent({ projectRoot: repo, config, session });
  assert.equal(still.branch, "main");

  // 6. RESTORE earlier checkpoint: content returns, later history preserved.
  const restored = restoreCheckpoint({ projectRoot: repo, config, taskId: "T-1", checkpointSha: sha1, restorePaths: ["app.txt"], reason: "discount approach rejected, back to subtotal", session, date: DATE });
  assert.equal(restored.status, "restored");
  assert.equal(readFileSync(join(repo, "app.txt"), "utf8"), v2);
  assert.equal(git(repo, "merge-base", "--is-ancestor", `${sha2}`, "HEAD"), "");

  // 7. TASTE: pending is inactive; only approval activates.
  proposeTasteRule({ projectRoot: repo, config, name: "no-any", rule: "Hindari `any`; pakai tipe eksplisit.", examples: ["T-1: koreksi `any` ke `unknown`"] });
  assert.equal(getTasteRule(repo, config, "no-any")?.status, "pending");
  assert.deepEqual(listTasteRules({ projectRoot: repo, config, status: "active" }), []);
  reviewTasteRule({ projectRoot: repo, config, name: "no-any", approve: true });
  assert.equal(listTasteRules({ projectRoot: repo, config, status: "active" }).length, 1);

  // 8. SUMMARY in plain language, claims mapped to real data.
  const outcome = verifyChecks([{ name: "smoke", command: [NODE, "-e", "process.exit(0)"] }], repo);
  const summary = buildSessionSummary({ projectRoot: repo, config, whatDone: ["Menyelesaikan subtotal T-1."], verifyOutcome: outcome, checkpointSha: sha1, checkpointTaskId: "T-1", remaining: [], nextStep: "Minta persetujuan menutup T-1.", date: DATE });
  assert.match(summary.markdown, /1\/1 pemeriksaan berhasil/);
  assert.match(summary.markdown, new RegExp(sha1));
  assert.match(summary.markdown, /berakhir normal/);

  // 9. WRONG-PROJECT gate still blocks at every layer.
  const wrong: ResolvedConfig = { ...config, projectId: "ghost" };
  assert.throws(() => buildResumeContext({ projectRoot: repo, config: wrong }), IdentityError);
  assert.throws(() => getTasteRule(repo, wrong, "no-any"), IdentityError);
  assert.throws(() => completeTask(frame, wrong, repo, DATE), (e: unknown) => e instanceof BuildError && e.code === "CONTEXT_MISMATCH");
});
