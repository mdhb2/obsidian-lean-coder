/**
 * Markdown vault adapter (OLC-023).
 *
 * - `resolveVaultDoc`: safe path resolver — resolved paths must stay inside
 *   the project's vault scope (`<vaultRoot>/OLC/Projects/<projectId>/`).
 * - Minimal frontmatter convention: flat `key: value` scalars only.
 * - `writeVaultDoc`: atomic (temp file + rename); refuses to replace an
 *   existing document unless `overwrite: true` is passed explicitly.
 * - `renderTemplate`: `{{variable}}` substitution over the package
 *   `templates/` directory; missing variables are an error, never silent.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export class VaultError extends Error {
  readonly code: "PATH_ESCAPE" | "ALREADY_EXISTS" | "TEMPLATE_ERROR";
  constructor(
    code: "PATH_ESCAPE" | "ALREADY_EXISTS" | "TEMPLATE_ERROR",
    message: string,
  ) {
    super(message);
    this.name = "VaultError";
    this.code = code;
  }
}

/** Vault scope root for one project, e.g. `<vault>/OLC/Projects/<id>`. */
export function projectScopeRoot(vaultRoot: string, projectId: string): string {
  return resolve(vaultRoot, "OLC", "Projects", projectId);
}

function checkSegment(segment: string): void {
  if (
    segment === "" ||
    segment === "." ||
    segment === ".." ||
    isAbsolute(segment) ||
    segment.includes("\0")
  ) {
    throw new VaultError(
      "PATH_ESCAPE",
      `Refused vault path segment ${JSON.stringify(segment)}: ` +
        "segments must be plain relative names, never absolute or parent references.",
    );
  }
}

/**
 * Resolve `...segments` inside the project's vault scope.
 * Throws `VaultError(PATH_ESCAPE)` when the result would leave the scope.
 */
export function resolveVaultDoc(
  vaultRoot: string,
  projectId: string,
  ...segments: string[]
): string {
  const scope = projectScopeRoot(vaultRoot, projectId);
  for (const segment of segments) {
    for (const part of segment.split("/")) checkSegment(part);
  }
  const resolved = resolve(scope, ...segments);
  if (resolved !== scope && !resolved.startsWith(scope + sep)) {
    throw new VaultError(
      "PATH_ESCAPE",
      `Refused vault path ${JSON.stringify(segments.join("/"))}: resolves outside the project scope.`,
    );
  }
  return resolved;
}

export interface FrontmatterDoc {
  data: Record<string, string>;
  body: string;
}

/** Parse `---\nkey: value\n---\nbody`. Flat string scalars only; no doc → empty data. */
export function parseFrontmatter(text: string): FrontmatterDoc {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!match) return { data: {}, body: text };
  const data: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    data[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  return { data, body: match[2] };
}

/** Serialize flat string data + body with `---` fences. Values must be single-line. */
export function withFrontmatter(data: Record<string, string>, body: string): string {
  for (const [key, value] of Object.entries(data)) {
    if (!/^[A-Za-z0-9_-]+$/.test(key) || value.includes("\n")) {
      throw new VaultError(
        "TEMPLATE_ERROR",
        `Cannot serialize frontmatter key ${JSON.stringify(key)}: keys must be [A-Za-z0-9_-] and values single-line.`,
      );
    }
  }
  const head = Object.entries(data)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
  return `---\n${head}\n---\n${body}`;
}

export function readVaultDoc(path: string): string {
  return readFileSync(path, "utf8");
}

export interface WriteOptions {
  /** Must be true to replace an existing document. Default false (never silent). */
  overwrite?: boolean;
}

/**
 * Atomically write a UTF-8 vault document (temp file in the same directory
 * + rename). Creates parent directories. Refuses to replace an existing file
 * unless `overwrite: true`.
 */
export function writeVaultDoc(path: string, content: string, options: WriteOptions = {}): void {
  if (!options.overwrite && existsSync(path)) {
    throw new VaultError(
      "ALREADY_EXISTS",
      `Refused to overwrite existing vault document at ${path}: pass { overwrite: true } to replace it explicitly.`,
    );
  }
  mkdirSync(dirname(path), { recursive: true });
  const tmp = join(dirname(path), `.olc-tmp-${process.pid}-${Date.now()}`);
  writeFileSync(tmp, content, "utf8");
  renameSync(tmp, path);
}

/** Locate the package `templates/` directory from the running module. */
export function findTemplatesDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [
    resolve(here, "..", "templates"),
    resolve(here, "..", "..", "templates"),
    resolve(here, "..", "..", "..", "templates"),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new VaultError(
    "TEMPLATE_ERROR",
    "Cannot locate the OLC templates/ directory relative to the running package. The installed package may be incomplete.",
  );
}

/**
 * Render a `templates/<name>.md` template with `{{variable}}` substitution.
 * Every placeholder must have a value; leftovers are an error.
 */
export function renderTemplate(name: string, vars: Record<string, string>): string {
  if (name.includes("/") || name.includes("\\") || name.startsWith(".")) {
    throw new VaultError(
      "TEMPLATE_ERROR",
      `Refused template name ${JSON.stringify(name)}: plain file names only.`,
    );
  }
  const path = join(findTemplatesDir(), `${name}.md`);
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new VaultError("TEMPLATE_ERROR", `Template not found: ${name}.md.`);
  }
  const missing = new Set<string>();
  const rendered = text.replace(/\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g, (m, key: string) => {
    if (!(key in vars)) {
      missing.add(key);
      return m;
    }
    return vars[key];
  });
  if (missing.size > 0) {
    throw new VaultError(
      "TEMPLATE_ERROR",
      `Template ${name}.md is missing values for: ${[...missing].join(", ")}.`,
    );
  }
  if (/\{\{\s*[A-Za-z0-9_-]+\s*\}\}/.test(rendered)) {
    throw new VaultError(
      "TEMPLATE_ERROR",
      `Template ${name}.md has placeholders that accept no value (check for typos).`,
    );
  }
  return rendered;
}

/** Template names shipped in `templates/` (one per OLC-023 work item). */
export const BUNDLED_TEMPLATES = [
  "intent",
  "plan",
  "explore-report",
  "checkpoint",
  "activity-log",
  "session-summary",
  "knowledge",
] as const;
