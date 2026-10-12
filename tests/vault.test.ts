import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  BUNDLED_TEMPLATES,
  VaultError,
  findTemplatesDir,
  parseFrontmatter,
  readVaultDoc,
  renderTemplate,
  resolveVaultDoc,
  withFrontmatter,
  writeVaultDoc,
} from "../src/vault/index.js";

function makeVault(): string {
  return mkdtempSync(join(tmpdir(), "olc023-"));
}

function assertVaultError(fn: () => unknown, code: string): VaultError {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof VaultError, `expected VaultError, got ${error}`);
    assert.equal(error.code, code);
    return error;
  }
  assert.fail("expected VaultError to be thrown");
}

test("path traversal outside the project scope is refused", () => {
  const vault = makeVault();
  for (const segs of [
    ["..", "escape.md"],
    ["tasks", "..", "..", "escape.md"],
    ["/etc/hostname"],
    ["sub", "."],
    [""],
  ]) {
    assertVaultError(() => resolveVaultDoc(vault, "proj", ...segs), "PATH_ESCAPE");
  }
});

test("plain nested paths resolve inside the scope", () => {
  const vault = makeVault();
  const got = resolveVaultDoc(vault, "proj", "tasks", "T-1", "plan.md");
  assert.equal(got, join(vault, "OLC", "Projects", "proj", "tasks", "T-1", "plan.md"));
});

test("write refuses to replace existing documents silently", () => {
  const vault = makeVault();
  const path = resolveVaultDoc(vault, "proj", "index.md");
  writeVaultDoc(path, "original");
  assertVaultError(() => writeVaultDoc(path, "replacement"), "ALREADY_EXISTS");
  assert.equal(readVaultDoc(path), "original");
  writeVaultDoc(path, "replacement", { overwrite: true });
  assert.equal(readVaultDoc(path), "replacement");
});

test("UTF-8 round-trip preserves content byte-identical", () => {
  const vault = makeVault();
  const text = "Ringkasan sesi: ✓ periksa — “kuÏt” 日本 café \u{1F600}\nbaris dua\n";
  const path = resolveVaultDoc(vault, "proj", "logs", "id.md");
  writeVaultDoc(path, text);
  assert.equal(readVaultDoc(path), text);
  assert.equal(readFileSync(path, "utf8"), text);
});

test("frontmatter round-trip", () => {
  const doc = withFrontmatter({ status: "draft", task: "T-1" }, "body here\n");
  const parsed = parseFrontmatter(doc);
  assert.deepEqual(parsed.data, { status: "draft", task: "T-1" });
  assert.equal(parsed.body, "body here\n");
  const plain = parseFrontmatter("no fence\n");
  assert.deepEqual(plain.data, {});
  assert.equal(plain.body, "no fence\n");
});

test("template render substitutes all variables, missing ones error", () => {
  const out = renderTemplate("decision", {
    project_id: "p",
    status: "pending",
    date: "2026-10-12",
    title: "T",
    context: "C",
    decision: "D",
    consequences: "Q",
  });
  assert.ok(!out.includes("{{"), "no placeholder may survive");
  assert.ok(out.includes("D"));
  assertVaultError(() => renderTemplate("decision", { project_id: "p" }), "TEMPLATE_ERROR");
  assertVaultError(() => renderTemplate("no-such-template", {}), "TEMPLATE_ERROR");
  assertVaultError(() => renderTemplate("../package", {}), "TEMPLATE_ERROR");
});

test("all bundled templates render and ship in the package", () => {
  const dir = findTemplatesDir();
  const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
  for (const name of BUNDLED_TEMPLATES) {
    assert.ok(files.includes(`${name}.md`), `templates/${name}.md ships in package`);
  }
  const vars: Record<string, string> = {
    project_id: "p",
    status: "s",
    task_id: "T-1",
    date: "2026-10-12",
    timestamp: "t",
    event: "e",
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
    commit_sha: "abc",
    summary: "s",
    verification: "v",
    what_done: "w",
    results: "r",
    remaining: "x",
    next_step: "n",
    title: "t",
    context: "c",
    decision: "d",
    consequences: "q",
    name: "n",
    rule: "r",
    examples: "e",
  };
  for (const name of BUNDLED_TEMPLATES) {
    const out = renderTemplate(name, vars);
    assert.ok(!out.includes("{{"), `${name}.md leaves no placeholder`);
  }
});
