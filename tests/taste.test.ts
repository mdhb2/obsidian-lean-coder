import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { ResolvedConfig } from "../src/config/index.js";
import { IdentityError } from "../src/core/project-identity.js";
import { draftTaskDocs } from "../src/planning/index.js";
import { registerTask } from "../src/tasks/index.js";
import {
  TasteError,
  getTasteRule,
  listTasteRules,
  proposeTasteRule,
  reviewTasteRule,
} from "../src/taste/index.js";
import { resolveVaultDoc } from "../src/vault/index.js";

function git(dir: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
}

function makeRepo(tag: string, branch = "main"): string {
  const dir = mkdtempSync(join(tmpdir(), tag));
  git(dir, "init", "-q", "-b", branch);
  git(dir, "config", "user.email", "t@t.local");
  git(dir, "config", "user.name", "t");
  writeFileSync(join(dir, "f.txt"), "x\n");
  git(dir, "add", ".");
  git(dir, "commit", "-qm", "init");
  return dir;
}

function makeVault(): string {
  const dir = mkdtempSync(join(tmpdir(), "olc064-vault-"));
  mkdirSync(join(dir, "OLC"), { recursive: true });
  writeFileSync(join(dir, "OLC", "registry.json"), JSON.stringify({ projects: {} }));
  return dir;
}

function addProject(vault: string, projectId: string, repoRoot: string): void {
  const path = join(vault, "OLC", "registry.json");
  const registry = JSON.parse(readFileSync(path, "utf8")) as {
    projects: Record<string, { repoRoot: string }>;
  };
  registry.projects[projectId] = { repoRoot };
  writeFileSync(path, JSON.stringify(registry));
}

function configFor(vaultRoot: string, projectId: string): ResolvedConfig {
  return { schemaVersion: 1, projectId, vaultPath: vaultRoot };
}

const DATE = "2026-10-12T10:00:00.000Z";
const INTENT = { what: "w", why: "y", nonGoals: "n", openQuestions: "q" };
const PLAN = { approach: "a", steps: "s", acceptanceCriteria: "c", tests: "t", risks: "r" };

function setup(): { vault: string; repoA: string; repoB: string; configA: ResolvedConfig; configB: ResolvedConfig } {
  const vault = makeVault();
  const repoA = makeRepo("olc064-repoA-");
  const repoB = makeRepo("olc064-repoB-");
  addProject(vault, "projA", repoA);
  addProject(vault, "projB", repoB);
  return { vault, repoA, repoB, configA: configFor(vault, "projA"), configB: configFor(vault, "projB") };
}

test("propose creates pending, never active", () => {
  const { repoA, configA } = setup();
  const rule = proposeTasteRule({
    projectRoot: repoA,
    config: configA,
    name: "no-any",
    rule: "Avoid `any`; prefer explicit types.",
    examples: ["corrected `any` to `unknown` in T1", "rejected `any` cast in review"],
  });
  assert.equal(rule.status, "pending");
  assert.equal(getTasteRule(repoA, configA, "no-any")?.status, "pending");
  assert.deepEqual(listTasteRules({ projectRoot: repoA, config: configA, status: "active" }), []);
  assert.equal(listTasteRules({ projectRoot: repoA, config: configA, status: "pending" }).length, 1);
  assert.equal(listTasteRules({ projectRoot: repoA, config: configA }).length, 1);
});

test("approval activates, re-review blocked", () => {
  const { repoA, configA } = setup();
  proposeTasteRule({
    projectRoot: repoA,
    config: configA,
    name: "no-any",
    rule: "Avoid `any`.",
    examples: ["signal one"],
  });
  const active = reviewTasteRule({ projectRoot: repoA, config: configA, name: "no-any", approve: true });
  assert.equal(active.status, "active");
  assert.equal(listTasteRules({ projectRoot: repoA, config: configA, status: "active" }).length, 1);
  assert.deepEqual(listTasteRules({ projectRoot: repoA, config: configA, status: "pending" }), []);
  assert.throws(
    () => reviewTasteRule({ projectRoot: repoA, config: configA, name: "no-any", approve: false }),
    (e: unknown) => e instanceof TasteError && e.code === "BAD_TRANSITION",
  );
});

test("rejection stays inactive, parked as rejected", () => {
  const { repoA, configA } = setup();
  proposeTasteRule({
    projectRoot: repoA,
    config: configA,
    name: "tabs-out",
    rule: "No tabs.",
    examples: ["signal one"],
  });
  const out = reviewTasteRule({ projectRoot: repoA, config: configA, name: "tabs-out", approve: false });
  assert.equal(out.status, "rejected");
  assert.deepEqual(listTasteRules({ projectRoot: repoA, config: configA, status: "active" }), []);
  assert.equal(listTasteRules({ projectRoot: repoA, config: configA, status: "rejected" })[0].name, "tabs-out");
});

test("taste never touches approved intent/plan", () => {
  const { vault, repoA, configA } = setup();
  registerTask(vault, "projA", "T1", "main", DATE);
  draftTaskDocs(vault, "projA", "T1", INTENT, PLAN);
  const intentBefore = readFileSync(resolveVaultDoc(vault, "projA", "tasks", "T1", "intent.md"), "utf8");
  const planBefore = readFileSync(resolveVaultDoc(vault, "projA", "tasks", "T1", "plan.md"), "utf8");
  proposeTasteRule({
    projectRoot: repoA,
    config: configA,
    name: "no-any",
    rule: "Avoid `any`.",
    examples: ["signal one"],
  });
  reviewTasteRule({ projectRoot: repoA, config: configA, name: "no-any", approve: true });
  assert.equal(readFileSync(resolveVaultDoc(vault, "projA", "tasks", "T1", "intent.md"), "utf8"), intentBefore);
  assert.equal(readFileSync(resolveVaultDoc(vault, "projA", "tasks", "T1", "plan.md"), "utf8"), planBefore);
});

test("cross-project isolation", () => {
  const { repoA, repoB, configA, configB } = setup();
  proposeTasteRule({
    projectRoot: repoA,
    config: configA,
    name: "no-any",
    rule: "Avoid `any`.",
    examples: ["signal one"],
  });
  assert.equal(getTasteRule(repoB, configB, "no-any"), null);
  assert.deepEqual(listTasteRules({ projectRoot: repoB, config: configB }), []);
  proposeTasteRule({
    projectRoot: repoB,
    config: configB,
    name: "no-any",
    rule: "Different project rule.",
    examples: ["other signal"],
  });
  assert.equal(getTasteRule(repoA, configA, "no-any")?.rule, "Avoid `any`.");
  assert.equal(getTasteRule(repoB, configB, "no-any")?.rule, "Different project rule.");
});

test("unknown rule, duplicate, invalid input fail safely", () => {
  const { vault, repoA, configA } = setup();
  assert.throws(
    () => reviewTasteRule({ projectRoot: repoA, config: configA, name: "ghost", approve: true }),
    (e: unknown) => e instanceof TasteError && e.code === "UNKNOWN_RULE",
  );
  assert.throws(
    () => proposeTasteRule({ projectRoot: repoA, config: configA, name: "../evil", rule: "x", examples: ["s"] }),
    (e: unknown) => e instanceof TasteError && e.code === "INVALID_NAME",
  );
  assert.throws(
    () => proposeTasteRule({ projectRoot: repoA, config: configA, name: "empty-rule", rule: "   ", examples: ["s"] }),
    (e: unknown) => e instanceof TasteError && e.code === "INVALID_INPUT",
  );
  assert.throws(
    () =>
      proposeTasteRule({ projectRoot: repoA, config: configA, name: "no-evidence", rule: "Do X.", examples: ["  "] }),
    (e: unknown) => e instanceof TasteError && e.code === "INVALID_INPUT",
  );
  proposeTasteRule({ projectRoot: repoA, config: configA, name: "dup", rule: "First.", examples: ["s1"] });
  assert.throws(
    () => proposeTasteRule({ projectRoot: repoA, config: configA, name: "dup", rule: "Second.", examples: ["s2"] }),
    (e: unknown) => e instanceof TasteError && e.code === "ALREADY_EXISTS",
  );
  assert.equal(getTasteRule(repoA, configA, "dup")?.rule, "First.");
  void vault;
});

test("wrong project identity throws before read/write", () => {
  const { repoA, repoB, configA } = setup();
  proposeTasteRule({ projectRoot: repoA, config: configA, name: "no-any", rule: "Avoid `any`.", examples: ["s"] });
  const wrongConfig: ResolvedConfig = { ...configA, projectId: "projB" };
  assert.throws(() => getTasteRule(repoA, wrongConfig, "no-any"), IdentityError);
  assert.throws(
    () => proposeTasteRule({ projectRoot: repoB, config: configA, name: "sneaky", rule: "X.", examples: ["s"] }),
    IdentityError,
  );
  assert.throws(
    () => reviewTasteRule({ projectRoot: repoB, config: configA, name: "no-any", approve: true }),
    IdentityError,
  );
  assert.equal(getTasteRule(repoA, configA, "no-any")?.status, "pending");
});
