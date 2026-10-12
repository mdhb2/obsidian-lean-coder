import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { draftTaskDocs } from "../src/planning/index.js";
import {
  readVaultDoc,
  renderTemplate,
  resolveVaultDoc,
  writeVaultDoc,
} from "../src/vault/index.js";

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "olc031-app-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "t@t"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
  writeFileSync(join(dir, "app.txt"), "v1\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-qm", "init"], { cwd: dir });
  return dir;
}

function makeVault(): string {
  return mkdtempSync(join(tmpdir(), "olc031-vault-"));
}

function appStatus(repo: string): string {
  return execFileSync("git", ["status", "--short"], { cwd: repo, encoding: "utf8" }).trim();
}

const REPORT_VARS = {
  project_id: "proj",
  task_id: "T-1",
  date: "2026-10-12",
  request: "Pencarian lambat pada katalog besar; pendekatan belum jelas.",
  findings: "templates/catalog.ts:12 memuat semua baris tanpa paging (bukti: profiling lokal 2.1s).",
  options: "A) paging server-side; B) cache hasil. A lebih sederhana, B lebih cepat untuk query berulang.",
  recommendation: "Pilih A dulu; ukur lagi sebelum mempertimbangkan B.",
};

test("complex request: explore writes one report, revises without losing reasoning, app untouched", () => {
  const repo = makeRepo();
  const vault = makeVault();
  const reportPath = resolveVaultDoc(vault, "proj", "tasks", "T-1", "explore", "report.md");

  const first = renderTemplate("explore-report", REPORT_VARS);
  writeVaultDoc(reportPath, first);
  assert.ok(!readVaultDoc(reportPath).includes("{{"), "no unfilled template vars remain");

  const revision =
    readVaultDoc(reportPath) +
    "\n## Revisi 2026-10-12 (temuan baru: indeks DB hilang)\n" +
    "Pendekatan A tetap; tambah migrasi indeks sebelum ukur ulang.\n";
  writeVaultDoc(reportPath, revision, { overwrite: true });
  const final = readVaultDoc(reportPath);
  assert.ok(final.includes("memuat semua baris tanpa paging"), "original reasoning preserved");
  assert.ok(final.includes("Revisi 2026-10-12"), "revision section present");

  assert.equal(appStatus(repo), "", "explore made zero app changes");
});

test("simple task: direct Plan with no explore report", () => {
  const repo = makeRepo();
  const vault = makeVault();

  const reportPath = resolveVaultDoc(vault, "proj", "tasks", "T-2", "explore", "report.md");
  assert.ok(!existsSync(reportPath), "no explore report for the simple task");

  const { intentPath, planPath } = draftTaskDocs(
    vault,
    "proj",
    "T-2",
    { what: "Tambah label versi di footer.", why: "Keterlacakan rilis.", nonGoals: "-", openQuestions: "Tidak ada." },
    { approach: "Satu baris teks.", steps: "1) edit footer.", acceptanceCriteria: "Label tampil.", tests: "Uji manual.", risks: "-" },
  );
  assert.ok(existsSync(intentPath) && existsSync(planPath), "plan docs drafted directly");
  assert.equal(appStatus(repo), "", "no app changes from planning");
});
