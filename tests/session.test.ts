import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { ResolvedConfig } from "../src/config/index.js";
import { logEvent } from "../src/log/index.js";
import { draftTaskDocs } from "../src/planning/index.js";
import { buildSessionSummary } from "../src/session/index.js";
import { registerTask, setTaskStatus } from "../src/tasks/index.js";
import { verifyChecks } from "../src/verify/index.js";

const NODE = process.execPath;
const DATE = "2026-10-12T12:00:00.000Z";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).replace(/\s+$/, "");
}

function setup(): { repo: string; vault: string; config: ResolvedConfig } {
  const repo = mkdtempSync(join(tmpdir(), "olc063-repo-"));
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.email", "test@local");
  git(repo, "config", "user.name", "test");
  writeFileSync(join(repo, "app.txt"), "v1\n");
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "init");
  const vault = mkdtempSync(join(tmpdir(), "olc063-vault-"));
  mkdirSync(join(vault, "OLC"), { recursive: true });
  writeFileSync(
    join(vault, "OLC", "registry.json"),
    JSON.stringify({ projects: { proj: { repoRoot: repo } } }),
  );
  const config: ResolvedConfig = { schemaVersion: 1, projectId: "proj", vaultPath: vault };
  return { repo, vault, config };
}

function seedTask(vault: string): void {
  registerTask(vault, "proj", "T-7", "main", DATE);
  draftTaskDocs(
    vault,
    "proj",
    "T-7",
    { what: "w", why: "y", nonGoals: "n", openQuestions: "q" },
    { approach: "a", steps: "s", acceptanceCriteria: "c", tests: "t", risks: "r" },
  );
  setTaskStatus(vault, "proj", "T-7", "approved", DATE);
}

test("normal completion: Indonesian summary maps real outcome, checkpoint, log", () => {
  const { repo, config } = setup();
  seedTask(config.vaultPath);
  const head = git(repo, "rev-parse", "HEAD");
  const outcome = verifyChecks(
    [{ name: "unit tests", command: [NODE, "-e", "process.exit(0)"] }],
    repo,
  );
  assert.equal(outcome.ok, true);

  const result = buildSessionSummary({
    projectRoot: repo,
    config,
    whatDone: ["Menambah tombol simpan pada halaman profil."],
    verifyOutcome: outcome,
    checkpointSha: head,
    checkpointTaskId: "T-7",
    remaining: [],
    nextStep: "Minta persetujuan pengguna untuk menutup task T-7.",
    date: DATE,
  });

  assert.match(result.markdown, /Menambah tombol simpan/);
  assert.match(result.markdown, /1\/1 pemeriksaan berhasil/);
  assert.match(result.markdown, new RegExp(head));
  assert.match(result.markdown, /ringkasan ini hanya dibuat bila sesi berakhir normal/);
  assert.match(result.markdown, /project: proj/);
  const raw = readFileSync(result.logFile, "utf8");
  assert.match(raw, /— session/);
  assert.match(raw, new RegExp(head.slice(0, 7)));
});

test("blocked session: work done, failing tests, blocker stated, no checkpoint claim", () => {
  const { repo, vault, config } = setup();
  seedTask(vault);
  const outcome = verifyChecks(
    [{ name: "typecheck", command: [NODE, "-e", "process.exit(3)"] }],
    repo,
    { maxAttempts: 2 },
  );
  assert.equal(outcome.ok, false);

  const result = buildSessionSummary({
    projectRoot: repo,
    config,
    whatDone: ["Mencoba memperbaiki validasi formulir."],
    verifyOutcome: outcome,
    blockedReason: "typecheck masih gagal setelah 2 percobaan; menunggu arahan.",
    remaining: ["Perbaiki error tipe pada berkas formulir."],
    nextStep: "Tunggu arahan pengguna, lalu lanjutkan perbaikan.",
    date: DATE,
  });

  assert.match(result.markdown, /belum lolos: 0\/1/);
  assert.match(result.markdown, /typecheck masih gagal/);
  assert.match(result.markdown, /Tidak ada checkpoint baru/);
  assert.match(result.markdown, /typecheck: gagal \(2 percobaan\)/);
  // Open-task line + no failed-claim overreach.
  assert.match(result.markdown, /Task terbuka: T-7 \(approved\)/);
  assert.doesNotMatch(result.markdown, /Checkpoint tersimpan/);
});

test("no-code-change session: honest empty sections, no invented tests", () => {
  const { repo, config } = setup();

  const result = buildSessionSummary({
    projectRoot: repo,
    config,
    whatDone: [],
    remaining: [],
    nextStep: "Jadwalkan sesi eksplorasi berikutnya bila dibutuhkan.",
    date: DATE,
  });

  assert.match(result.markdown, /Tidak ada perubahan kode/);
  assert.match(result.markdown, /Tidak ada verifikasi yang dijalankan/);
  assert.match(result.markdown, /Tidak ada checkpoint baru/);
  assert.match(result.markdown, /Tidak ada sisa pekerjaan yang tercatat/);
  assert.doesNotMatch(result.markdown, /lolos|gagal/);
});

test("partial failure: passing tests but blocked still reports both", () => {
  const { repo, config } = setup();
  seedTask(config.vaultPath);
  const outcome = verifyChecks(
    [{ name: "unit tests", command: [NODE, "-e", "process.exit(0)"] }],
    repo,
  );

  const result = buildSessionSummary({
    projectRoot: repo,
    config,
    whatDone: ["Menyelesaikan refactor kecil."],
    verifyOutcome: outcome,
    blockedReason: "Butuh keputusan API dari pengguna sebelum commit.",
    remaining: ["Commit setelah keputusan API jelas."],
    nextStep: "Minta keputusan API kepada pengguna.",
    date: DATE,
  });

  assert.match(result.markdown, /Verifikasi lolos: 1\/1/);
  assert.match(result.markdown, /Butuh keputusan API/);
  assert.match(result.markdown, /Tidak ada checkpoint baru/);
});

test("summary event is visible to the next resume", () => {
  const { repo, vault, config } = setup();
  seedTask(vault);
  logEvent({
    projectRoot: repo,
    config,
    event: { kind: "verify", summary: "tests green", date: "2026-10-12T11:00:00.000Z" },
  });
  buildSessionSummary({
    projectRoot: repo,
    config,
    whatDone: ["Menutup pekerjaan sesi ini."],
    remaining: [],
    nextStep: "Lanjut task berikutnya.",
    date: DATE,
  });

  const raw = readFileSync(join(vault, "OLC", "Projects", "proj", "logs", "2026-10-12.md"), "utf8");
  assert.match(raw, /tests green/);
  assert.match(raw, /Ringkasan sesi: selesai tanpa checkpoint baru/);
});
