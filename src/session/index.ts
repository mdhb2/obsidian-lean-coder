/**
 * Session summary in plain language (OLC-063).
 *
 * Ends a normal session with a useful, non-technical summary in Indonesian,
 * rendered through the `session-summary` template. Factual claims are mapped
 * to real data only:
 * - verification lines come from the caller's `VerifyOutcome` (never
 *   invented — no outcome means "no tests ran");
 * - the checkpoint line appears only when the caller passes the real
 *   `checkpointSha` of this session;
 * - open tasks / last events come from `buildResumeContext` (OLC-061).
 *
 * Durability: the full text is returned to the caller (the agent shows it),
 * and a compact `session` event is appended to the activity log (OLC-060),
 * so the next resume surfaces it. No separate summary file — that would
 * need a new path convention for zero retrieval benefit.
 *
 * Honesty limit: this function only runs when the session ends normally. A
 * hard kill produces no summary; the last log event is then the recovery
 * point (see OLC-061). The rendered text says so in its footer.
 */

import type { ResolvedConfig } from "../config/index.js";
import { logEvent } from "../log/index.js";
import { buildResumeContext } from "../resume/index.js";
import type { VerifyOutcome } from "../verify/index.js";
import { renderTemplate } from "../vault/index.js";

export interface SessionSummaryInput {
  /** Any directory inside the project (identity resolution starts here). */
  projectRoot: string;
  config: ResolvedConfig;
  /** What was done, in plain words. Empty = no-code-change session. */
  whatDone: string[];
  /** Real test outcome when tests ran; omit when none ran. */
  verifyOutcome?: VerifyOutcome;
  /** Note shown when no tests ran (e.g. why). */
  testsNote?: string;
  /** Real checkpoint commit SHA created this session, if any. */
  checkpointSha?: string;
  /** Task the checkpoint belongs to, if any. */
  checkpointTaskId?: string;
  /** Why the session stopped without finishing (blocked scenario). */
  blockedReason?: string;
  /** Unfinished work, in plain words. */
  remaining: string[];
  /** Next step, in plain words. */
  nextStep: string;
  /** ISO timestamp; defaults to now. Inject a fixed value in tests. */
  date?: string;
}

export interface SessionSummaryResult {
  /** Full Indonesian summary (show this to the user). */
  markdown: string;
  /** Activity-log file the compact `session` event was appended to. */
  logFile: string;
  date: string;
}

function bullets(items: string[]): string {
  return items.map((i) => `- ${i}`).join("\n");
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function buildSessionSummary(input: SessionSummaryInput): SessionSummaryResult {
  const iso = input.date ?? new Date().toISOString();
  // Identity gate + real vault state (open tasks, recent events). Throws
  // before anything is written when the vault is unavailable or mismatched.
  const ctx = buildResumeContext({
    projectRoot: input.projectRoot,
    config: input.config,
    lastEventsLimit: 10,
  });

  const whatDone =
    input.whatDone.length > 0
      ? bullets(input.whatDone)
      : "Tidak ada perubahan kode pada sesi ini.";

  const resultLines: string[] = [];
  if (input.verifyOutcome) {
    const passed = input.verifyOutcome.results.filter((r) => r.ok).length;
    const total = input.verifyOutcome.results.length;
    resultLines.push(
      input.verifyOutcome.ok
        ? `Verifikasi lolos: ${passed}/${total} pemeriksaan berhasil.`
        : `Verifikasi belum lolos: ${passed}/${total} pemeriksaan berhasil. Perlu ditangani: ${input.verifyOutcome.escalated.join(", ") || "-"}.`,
    );
  } else {
    resultLines.push("Tidak ada verifikasi yang dijalankan pada sesi ini.");
  }
  if (input.checkpointSha) {
    resultLines.push(
      `Checkpoint tersimpan pada commit ${input.checkpointSha}` +
        (input.checkpointTaskId ? ` (task ${input.checkpointTaskId}).` : "."),
    );
  } else {
    resultLines.push("Tidak ada checkpoint baru pada sesi ini.");
  }
  if (input.blockedReason) {
    resultLines.push(`Sesi terhenti: ${input.blockedReason}`);
  }
  const results = resultLines.join("\n");

  const tests = input.verifyOutcome
    ? [
        ...input.verifyOutcome.results.map(
          (r) => `- ${r.name}: ${r.ok ? "lolos" : "gagal"} (${r.attempts.length} percobaan)`,
        ),
        ...(input.verifyOutcome.ok
          ? []
          : [`Perlu arahan pengguna: ${input.verifyOutcome.escalated.join(", ") || "-"}.`]),
      ].join("\n")
    : (input.testsNote ?? "Tidak ada test yang dijalankan pada sesi ini.");

  const openLine =
    ctx.openTasks.length > 0
      ? `Task terbuka: ${ctx.openTasks.map((t) => `${t.taskId} (${t.entry.status})`).join(", ")}.`
      : "Tidak ada task terbuka.";
  const remaining = [
    ...(input.remaining.length > 0 ? [bullets(input.remaining)] : ["Tidak ada sisa pekerjaan yang tercatat."]),
    openLine,
    ...(input.blockedReason ? [`Penghalang: ${input.blockedReason}`] : []),
  ].join("\n");

  const markdown = renderTemplate("session-summary", {
    project_id: input.config.projectId,
    date: iso,
    what_done: whatDone,
    results,
    tests,
    remaining,
    next_step: input.nextStep,
  }) + "\nCatatan: ringkasan ini hanya dibuat bila sesi berakhir normal. Bila sesi mati mendadak, event terakhir di log adalah titik pemulihan.\n";

  const headline = input.blockedReason
    ? `terhenti: ${oneLine(input.blockedReason)}`
    : input.checkpointSha
      ? `selesai, checkpoint ${input.checkpointSha.slice(0, 7)}`
      : "selesai tanpa checkpoint baru";
  const { file } = logEvent({
    projectRoot: input.projectRoot,
    config: input.config,
    event: {
      kind: "session",
      summary: `Ringkasan sesi: ${headline}.`,
      details: `next: ${oneLine(input.nextStep)}`,
      ...(input.checkpointSha ? { gitSha: input.checkpointSha } : {}),
      ...(input.checkpointTaskId ? { taskId: input.checkpointTaskId } : {}),
      date: iso,
    },
  });

  return { markdown, logFile: file, date: iso };
}
