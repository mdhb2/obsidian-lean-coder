import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { test } from "node:test";

import type { ResolvedConfig } from "../src/config/index.js";
import { renderTemplate } from "../src/vault/index.js";
import { initProject } from "../src/init/index.js";
import { draftTaskDocs, reviseTaskDocs } from "../src/planning/index.js";
import { logEvent, readLogDay } from "../src/log/index.js";
import { appendCheckpointRecord } from "../src/git/checkpoint.js";

/**
 * OLC-079 — vault cross-linking for the second-brain graph.
 *
 * The vault is the project's long-term record, so every document must link to
 * its neighbours under `## Terkait`. These tests pin that contract at two
 * levels: each template carries the expected wikilinks, and a full fixture
 * walk resolves every `[[...]]` target on disk — zero broken links.
 */

const PROJECT_ID = "proj";
const TASK_ID = "T-1";
const DATE = "2026-10-13T09:00:00.000Z";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).replace(/\s+$/, "");
}

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "olc079-repo-"));
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "test@local");
  git(dir, "config", "user.name", "test");
  writeFileSync(join(dir, "app.txt"), "v1\n");
  git(dir, "add", ".");
  git(dir, "commit", "-qm", "init");
  return dir;
}

/** Full variable set covering every bundled template. */
function templateVars(): Record<string, string> {
  return {
    project_id: PROJECT_ID,
    task_id: TASK_ID,
    status: "draft",
    date: "2026-10-13",
    timestamp: "09:00:00Z",
    event: "milestone",
    details: "d",
    what: "w",
    why: "y",
    non_goals: "n",
    open_questions: "q",
    approach: "a",
    steps: "s",
    acceptance_criteria: "c",
    tests: "t",
    risks: "r",
    request: "q",
    findings: "f",
    options: "o",
    recommendation: "r",
    commit_sha: "abc123",
    summary: "s",
    verification: "v",
    what_done: "w",
    results: "r",
    remaining: "x",
    next_step: "n",
  };
}

/** Markdown files under `dir`, recursively. */
function markdownFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".md")) out.push(full);
    }
  };
  walk(dir);
  return out;
}

test("every doc template ships a Terkait section with relative wikilinks", () => {
  const expected: Record<string, string[]> = {
    intent: ["[[../T-1/plan]]", "[[../../index]]", "[[../../current-state]]"],
    plan: ["[[../T-1/intent]]", "[[../T-1/history]]", "[[../../index]]", "[[../../current-state]]"],
    checkpoint: ["[[../T-1/intent]]", "[[../T-1/plan]]", "[[../T-1/history]]"],
    "explore-report": ["[[../../T-1/intent]]", "[[../../T-1/plan]]", "[[../../index]]"],
    "activity-log": ["[[../index]]", "[[../current-state]]"],
  };
  for (const [name, links] of Object.entries(expected)) {
    const out = renderTemplate(name, templateVars());
    assert.ok(out.includes("## Terkait"), `${name}.md has a Terkait section`);
    for (const link of links) {
      assert.ok(out.includes(link), `${name}.md links ${link}`);
    }
  }
});

test("session-summary stays link-free", () => {
  // session-summary is returned in chat, never written to a fixed vault path,
  // so it must not carry links that would resolve to arbitrary locations.
  const summary = renderTemplate("session-summary", templateVars());
  assert.ok(!summary.includes("## Terkait"), "session-summary.md stays without links");
  assert.ok(!summary.includes("[["), "session-summary.md contains no wikilinks");
});

/**
 * Build the full fixture the way a real task run does: init → draft → revise
 * (history) → checkpoint record → logged task event. Every markdown file
 * produced must then have all of its wikilinks resolve to real files.
 */
function buildFixture(): { repo: string; vault: string; config: ResolvedConfig } {
  const repo = makeRepo();
  const vault = mkdtempSync(join(tmpdir(), "olc079-vault-"));
  const gitSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();

  initProject({ projectRoot: repo, projectId: PROJECT_ID, vaultPath: vault, env: {} });

  const vars = {
    what: "Cross-link vault docs",
    why: "Second-brain graph",
    nonGoals: "No backfill",
    openQuestions: "None",
    approach: "Add Terkait sections",
    steps: "Edit templates",
    acceptanceCriteria: "No broken links",
    tests: "npm test",
    risks: "None",
  };
  draftTaskDocs(vault, PROJECT_ID, TASK_ID, vars, vars);
  reviseTaskDocs(vault, PROJECT_ID, TASK_ID, "Scope narrowed.", "2026-10-13");
  appendCheckpointRecord(vault, PROJECT_ID, TASK_ID, {
    task_id: TASK_ID,
    project_id: PROJECT_ID,
    commit_sha: gitSha,
    date: "2026-10-13",
    summary: "Added links",
    verification: "npm test green",
  });

  const config: ResolvedConfig = { schemaVersion: 1, projectId: PROJECT_ID, vaultPath: vault };
  logEvent({
    projectRoot: repo,
    config,
    event: { kind: "milestone", taskId: TASK_ID, summary: "Linked the vault", date: DATE },
  });
  logEvent({
    projectRoot: repo,
    config,
    event: { kind: "checkpoint", summary: "Task-level event without taskId", date: DATE },
  });
  return { repo, vault, config };
}

test("fixture vault has zero broken wikilinks across every document", () => {
  const { vault } = buildFixture();
  const scope = resolve(vault, "OLC", "Projects", PROJECT_ID);
  const broken: string[] = [];
  let checked = 0;
  for (const file of markdownFiles(scope)) {
    const text = readFileSync(file, "utf8");
    const pattern = /\[\[([^\]]+)\]\]/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const [target] = match[1].split("|");
      const path = target.split("#")[0].trim();
      if (path === "") continue;
      checked++;
      const resolved = resolve(dirname(file), `${path}.md`);
      if (!existsSync(resolved)) broken.push(`${file} → [[${path}]]`);
    }
  }
  assert.ok(checked > 10, `fixture produced a linked graph (${checked} links checked)`);
  assert.deepEqual(broken, [], `broken links: ${broken.join("; ")}`);
});

test("hub index.md and current-state.md link to each other", () => {
  const { vault } = buildFixture();
  const scope = resolve(vault, "OLC", "Projects", PROJECT_ID);
  const index = readFileSync(join(scope, "index.md"), "utf8");
  const state = readFileSync(join(scope, "current-state.md"), "utf8");
  assert.ok(index.includes("[[current-state]]"), "index.md links current-state.md");
  assert.ok(state.includes("[[index]]"), "current-state.md links index.md");
});

test("re-init preserves the linked hub documents", () => {
  const { repo, vault } = buildFixture();
  initProject({ projectRoot: repo, projectId: PROJECT_ID, vaultPath: vault, env: {} });
  const scope = resolve(vault, "OLC", "Projects", PROJECT_ID);
  const index = readFileSync(join(scope, "index.md"), "utf8");
  const state = readFileSync(join(scope, "current-state.md"), "utf8");
  assert.ok(index.includes("[[current-state]]"), "index.md keeps its link after re-init");
  assert.ok(state.includes("[[index]]"), "current-state.md keeps its link after re-init");
  assert.ok(markdownFiles(scope).length > 0);
});

test("log entries link to their task docs and still round-trip", () => {
  const { vault } = buildFixture();
  const entries = readLogDay(vault, PROJECT_ID, "2026-10-13");
  const withTask = entries.find((event) => event.taskId === TASK_ID);
  assert.ok(withTask, "task event was logged");
  assert.equal(withTask.summary, "Linked the vault");

  const dayFile = join(resolve(vault, "OLC", "Projects", PROJECT_ID, "logs"), "2026-10-13.md");
  const text = readFileSync(dayFile, "utf8");
  const terkaitLines = text.split("\n").filter((line) => line.startsWith("- terkait:"));
  assert.equal(terkaitLines.length, 1, "only the task event carries Terkait links");
  assert.ok(
    text.includes(`- terkait: [[../tasks/${TASK_ID}/intent]], [[../tasks/${TASK_ID}/plan]]`),
    "task event carries Terkait links into the daily log",
  );
  // The unknown `terkait` key must not leak into parsed data.
  assert.equal((withTask as unknown as { terkait?: string }).terkait, undefined);
});
