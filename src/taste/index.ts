/**
 * Taste proposal lifecycle (OLC-064).
 *
 * Project-specific preferences are learned without silently changing
 * behavior: a repeated signal becomes a `pending` proposal carrying its
 * examples/evidence, and only an explicit user approval flips it to
 * `active`. Rejection parks it as `rejected` (history, never applied).
 * Pending rules are never treated as active by any consumer.
 *
 * Scope guarantees:
 * - Identity is validated first; wrong project or unavailable vault throws
 *   before any read or write.
 * - Every path resolves inside `<vault>/OLC/Projects/<projectId>/taste/`,
 *   so other projects are untouched by construction.
 * - This module only ever touches `taste/` — approved intent/plan docs
 *   under `tasks/` cannot be overwritten from here.
 * - Reuses the OLC-023 atomic create-only write: proposals never silently
 *   replace an existing rule, and status flips require the rule to be
 *   `pending` (terminal `active`/`rejected` states reject further review).
 */

import { readdirSync } from "node:fs";

import type { ResolvedConfig } from "../config/index.js";
import { validateIdentity } from "../core/project-identity.js";
import {
  parseFrontmatter,
  readVaultDoc,
  renderTemplate,
  resolveVaultDoc,
  writeVaultDoc,
} from "../vault/index.js";

export type TasteStatus = "pending" | "active" | "rejected";

export type TasteErrorCode =
  | "INVALID_NAME"
  | "INVALID_INPUT"
  | "UNKNOWN_RULE"
  | "BAD_TRANSITION"
  | "ALREADY_EXISTS"
  | "CORRUPT_RULE";

export class TasteError extends Error {
  readonly code: TasteErrorCode;
  constructor(code: TasteErrorCode, message: string) {
    super(message);
    this.name = "TasteError";
    this.code = code;
  }
}

export interface TasteRule {
  name: string;
  status: TasteStatus;
  rule: string;
  examples: string;
}

function checkName(name: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(name)) {
    throw new TasteError(
      "INVALID_NAME",
      `Invalid taste rule name ${JSON.stringify(name)}: use letters, digits, dash or underscore, starting with a letter or digit. No paths, no extensions (".md" is added).`,
    );
  }
}

function readOrNull(path: string): string | null {
  try {
    return readVaultDoc(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function listMdFiles(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => e.name)
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

const RULE_MARKER = "## Rule (aturan)";
const EXAMPLES_MARKER = "## Examples / evidence";

function parseTasteRule(name: string, text: string, path: string): TasteRule {
  const { data, body } = parseFrontmatter(text);
  const status = data["status"];
  if (status !== "pending" && status !== "active" && status !== "rejected") {
    throw new TasteError(
      "CORRUPT_RULE",
      `Taste rule at ${path} has unknown status ${JSON.stringify(status)}. Expected pending, active, or rejected — fix or delete the file.`,
    );
  }
  const ruleAt = body.indexOf(RULE_MARKER);
  const examplesAt = body.indexOf(EXAMPLES_MARKER);
  if (ruleAt === -1 || examplesAt === -1 || examplesAt < ruleAt) {
    throw new TasteError(
      "CORRUPT_RULE",
      `Taste rule at ${path} does not follow the taste-rule template (missing Rule / Examples sections). Fix or delete the file.`,
    );
  }
  return {
    name,
    status,
    rule: body.slice(ruleAt + RULE_MARKER.length, examplesAt).trim(),
    examples: body.slice(examplesAt + EXAMPLES_MARKER.length).trim(),
  };
}

function rulePath(vaultRoot: string, projectId: string, name: string): string {
  return resolveVaultDoc(vaultRoot, projectId, "taste", `${name}.md`);
}

function renderRule(projectId: string, status: TasteStatus, name: string, rule: string, examples: string): string {
  return renderTemplate("taste-rule", { project_id: projectId, status, name, rule, examples });
}

export interface ProposeTasteInput {
  /** Any directory inside the project (identity resolution starts here). */
  projectRoot: string;
  config: ResolvedConfig;
  /** Plain name (`no-any` → `taste/no-any.md`). No paths. */
  name: string;
  /** The proposed preference text. Must be non-empty. */
  rule: string;
  /**
   * Observed repeat signals backing the proposal (corrections, accepts,
   * rejects). At least one non-empty entry is required — a proposal
   * without evidence is rejected outright.
   */
  examples: string[];
}

/**
 * Record a repeat signal as a `pending` proposal. Never active on creation:
 * activation needs a separate explicit `reviewTasteRule` approval.
 * Throws before any write on invalid input or failed identity; an existing
 * rule is never silently replaced.
 */
export function proposeTasteRule(input: ProposeTasteInput): TasteRule {
  checkName(input.name);
  if (typeof input.rule !== "string" || input.rule.trim() === "") {
    throw new TasteError("INVALID_INPUT", "Taste rule text must be a non-empty string.");
  }
  const examples = (input.examples ?? []).filter((e) => typeof e === "string" && e.trim() !== "");
  if (examples.length === 0) {
    throw new TasteError(
      "INVALID_INPUT",
      "A taste proposal needs at least one example/evidence entry (the observed repeat signals).",
    );
  }
  const identity = validateIdentity(input.projectRoot, input.config);
  const path = rulePath(identity.vaultRoot, identity.projectId, input.name);
  if (readOrNull(path) !== null) {
    throw new TasteError(
      "ALREADY_EXISTS",
      `Taste rule ${JSON.stringify(input.name)} already exists. Review or delete it explicitly — proposals are never merged silently.`,
    );
  }
  const rule: TasteRule = {
    name: input.name,
    status: "pending",
    rule: input.rule.trim(),
    examples: examples.map((e) => `- ${e.trim()}`).join("\n"),
  };
  writeVaultDoc(
    path,
    renderRule(identity.projectId, "pending", rule.name, rule.rule, rule.examples),
  );
  return rule;
}

/** Read one rule, or null when it does not exist. Identity is checked first. */
export function getTasteRule(
  projectRoot: string,
  config: ResolvedConfig,
  name: string,
): TasteRule | null {
  checkName(name);
  const identity = validateIdentity(projectRoot, config);
  const path = rulePath(identity.vaultRoot, identity.projectId, name);
  const text = readOrNull(path);
  if (text === null) return null;
  return parseTasteRule(name, text, path);
}

export interface ListTasteInput {
  projectRoot: string;
  config: ResolvedConfig;
  /** When set, only rules with this status are returned. */
  status?: TasteStatus;
}

/** List rules in the validated project scope, sorted by name. Read-only. */
export function listTasteRules(input: ListTasteInput): TasteRule[] {
  const identity = validateIdentity(input.projectRoot, input.config);
  const dir = resolveVaultDoc(identity.vaultRoot, identity.projectId, "taste");
  const out: TasteRule[] = [];
  for (const file of listMdFiles(dir)) {
    const name = file.slice(0, -".md".length);
    const path = rulePath(identity.vaultRoot, identity.projectId, name);
    const text = readOrNull(path);
    if (text === null) continue;
    const rule = parseTasteRule(name, text, path);
    if (input.status === undefined || rule.status === input.status) out.push(rule);
  }
  return out;
}

export interface ReviewTasteInput {
  /** Any directory inside the project (identity resolution starts here). */
  projectRoot: string;
  config: ResolvedConfig;
  name: string;
  /** True = user approves (pending→active); false = rejects (pending→rejected). */
  approve: boolean;
}

/**
 * Explicit user review of a `pending` proposal. Only pending rules move;
 * active/rejected are terminal (re-review throws `BAD_TRANSITION`), and
 * unknown names throw `UNKNOWN_RULE`. Nothing else in the vault is touched.
 */
export function reviewTasteRule(input: ReviewTasteInput): TasteRule {
  checkName(input.name);
  const identity = validateIdentity(input.projectRoot, input.config);
  const path = rulePath(identity.vaultRoot, identity.projectId, input.name);
  const text = readOrNull(path);
  if (text === null) {
    throw new TasteError(
      "UNKNOWN_RULE",
      `Taste rule ${JSON.stringify(input.name)} does not exist. Propose it first.`,
    );
  }
  const current = parseTasteRule(input.name, text, path);
  if (current.status !== "pending") {
    throw new TasteError(
      "BAD_TRANSITION",
      `Taste rule ${JSON.stringify(input.name)} is already ${current.status} — only pending proposals can be reviewed.`,
    );
  }
  const next: TasteStatus = input.approve ? "active" : "rejected";
  writeVaultDoc(
    path,
    renderRule(identity.projectId, next, current.name, current.rule, current.examples),
    { overwrite: true },
  );
  return { ...current, status: next };
}
