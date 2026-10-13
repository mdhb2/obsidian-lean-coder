/**
 * OLC plugin tools (part of OLC-080).
 *
 * Exposes OLC's library modules as agent-callable tools under the `olc`
 * namespace so that agents can actually record memory, propose taste rules,
 * log events, record decisions, and produce a session summary. Before this
 * module existed, the modules were library-internal and the skills only
 * described pseudo-function calls the agent could not invoke — so nothing
 * was ever saved (see root AGENTS.md / agents/olc-build.md closeout problem).
 *
 * Safety:
 * - Every tool resolves `loadConfig(ctx.location.directory)` inside a try and
 *   maps module errors (ConfigError/IdentityError/MemoryError/TasteError/
 *   LogError/VaultError/BuildError) to `{ ok: false, error: { code, message } }`.
 *   Modules self-gate identity (`validateIdentity`) before any read/write, so a
 *   wrong/missing project or vault never leaks writes to the wrong place.
 * - No file writes happen at plugin load or tool registration — only when a
 *   tool's `execute` runs (matching OLC-011's no-surprise-writes rule).
 * - The `decision_record` tool is create-only: it never overwrites an existing
 *   `decisions/<date>-<slug>.md` (atomic write refuses to replace).
 */

import type { Plugin } from "@opencode/plugin";

import type { ResolvedConfig } from "./config/index.js";
import { loadConfig } from "./config/index.js";
import { recordDecision } from "./build/index.js";
import {
  recallMemory,
  recordMemory,
  type RecallInput,
  type RecordMemoryInput,
} from "./memory/index.js";
import {
  proposeTasteRule,
  listTasteRules,
  reviewTasteRule,
  type ProposeTasteInput,
  type ListTasteInput,
  type ReviewTasteInput,
} from "./taste/index.js";
import { logEvent, type LogEventArgs, type LogEventKind } from "./log/index.js";
import { buildSessionSummary, type SessionSummaryInput } from "./session/index.js";
import { validateIdentity } from "./core/project-identity.js";
import {
  renderTemplate,
  resolveVaultDoc,
  writeVaultDoc,
} from "./vault/index.js";

/** Error shape every module throws with (some have `code`, some do not). */
function toOlcError(error: unknown): { code: string; message: string } {
  if (error instanceof Error) {
    const code = (error as Error & { code?: string }).code;
    return { code: code ?? "ERROR", message: error.message };
  }
  return { code: "ERROR", message: String(error) };
}

/** Common success envelope. */
function ok(payload: Record<string, unknown>) {
  return { content: JSON.stringify({ ok: true, ...payload }, null, 2) };
}

/** Common error envelope (never throws across the tool boundary). */
function fail(error: unknown) {
  return { content: JSON.stringify({ ok: false, error: toOlcError(error) }, null, 2) };
}

/**
 * New surface for design decisions: renders `templates/decision.md` and writes
 * it to `decisions/<YYYY-MM-DD>-<slug>.md`, create-only (never overwrites).
 * Fills the gap that `recordDecision` only appended to a task's history.md and
 * no module ever wrote `decisions/`.
 */
export interface DecisionRecordInput {
  /** Plain name used in the heading, also slugified into the file name. */
  title: string;
  /** Why this decision was needed. */
  context: string;
  /** The decision itself, in plain words. */
  decision: string;
  /** What must be followed / what it costs. */
  consequences: string;
  /** Decision status. Default "decided". */
  status?: string;
  /** Related doc links (Obsidian `[[...]]` or free text). */
  related?: string;
  /** ISO date (YYYY-MM-DD) for the file name + frontmatter. Default today. */
  date?: string;
}

function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base === "" ? "decision" : base;
}

function recordDecisionDoc(input: DecisionRecordInput, projectRoot: string, config: ResolvedConfig) {
  const identity = validateIdentity(projectRoot, config);
  const date = input.date ?? new Date().toISOString().slice(0, 10);
  const status = input.status?.trim() || "decided";
  const rendered = renderTemplate("decision", {
    project_id: config.projectId,
    status,
    date,
    title: input.title.trim(),
    context: input.context.trim(),
    decision: input.decision.trim(),
    consequences: input.consequences.trim(),
    related: (input.related ?? "").trim(),
  });
  const file = resolveVaultDoc(
    identity.vaultRoot,
    identity.projectId,
    "decisions",
    `${date}-${slugify(input.title)}.md`,
  );
  writeVaultDoc(file, rendered, { overwrite: false });
  return { file, date, status };
}

/**
 * Register all OLC tools. Call from `plugin.ts` setup after the namespace is
 * declared. Each tool's `execute` resolves config + calls the matching module,
 * returning JSON so the agent can read the structured result.
 */
export async function registerOlcTools(
  ctx: import("@opencode/plugin").Plugin.Context,
): Promise<void> {
  const dir = ctx.location.directory;
  await ctx.tool.transform(
    (editor: Parameters<Parameters<typeof ctx.tool.transform>[0]>[0]) => {
    editor.add({
      name: "memory_recall",
      description:
        "Recall relevant project memory/decisions and recent log events. Read-only.",
      input: {
        type: "object",
        properties: {
          query: { type: "string", description: "Free-text search across memory/decisions docs." },
          taskId: { type: "string", description: "Include this task's intent/plan docs." },
          includeLogs: { type: "boolean", description: "Include recent log events. Default true." },
          logLimit: { type: "number", description: "Max log events. Default 10." },
          limit: { type: "number", description: "Max doc matches. Default 8." },
        },
        additionalProperties: false,
      },
      options: { namespace: "olc" },
      execute: async (raw: unknown) => {
        const r = (raw ?? {}) as Record<string, unknown>;
        try {
          const config = loadConfig(dir);
          const input: RecallInput = {
            projectRoot: dir,
            config,
            query: r.query as string | undefined,
            taskId: r.taskId as string | undefined,
            includeLogs: r.includeLogs as boolean | undefined,
            logLimit: r.logLimit as number | undefined,
            limit: r.limit as number | undefined,
          };
          return ok(recallMemory(input) as unknown as Record<string, unknown>);
        } catch (error) {
          return fail(error);
        }
      },
    });

    editor.add({
      name: "memory_record",
      description:
        "Record one memory note (memory/<name>.md) inside the validated project scope.",
      input: {
        type: "object",
        properties: {
          name: { type: "string", description: "Plain memory name, letters/digits/-/_ only. No .md." },
          content: { type: "string", description: "Markdown body, non-empty." },
          overwrite: { type: "boolean", description: "Replace an existing note. Default false." },
        },
        required: ["name", "content"],
        additionalProperties: false,
      },
      options: { namespace: "olc" },
      execute: async (raw: unknown) => {
        const r = (raw ?? {}) as Record<string, unknown>;
        try {
          const config = loadConfig(dir);
          const input: RecordMemoryInput = {
            projectRoot: dir,
            config,
            name: r.name as string,
            content: r.content as string,
            overwrite: r.overwrite as boolean | undefined,
          };
          const path = recordMemory(input);
          return ok({ path });
        } catch (error) {
          return fail(error);
        }
      },
    });

    editor.add({
      name: "taste_propose",
      description:
        "Propose a taste rule as a pending proposal (never active). Needs >=1 example/evidence.",
      input: {
        type: "object",
        properties: {
          name: { type: "string", description: "Plain rule name, letters/digits/-/_ only." },
          rule: { type: "string", description: "The proposed preference text, non-empty." },
          examples: {
            type: "array",
            items: { type: "string" },
            description: "Observed repeat signals backing the proposal (>=1 non-empty).",
          },
        },
        required: ["name", "rule", "examples"],
        additionalProperties: false,
      },
      options: { namespace: "olc" },
      execute: async (raw: unknown) => {
        const r = (raw ?? {}) as Record<string, unknown>;
        try {
          const config = loadConfig(dir);
          const input: ProposeTasteInput = {
            projectRoot: dir,
            config,
            name: r.name as string,
            rule: r.rule as string,
            examples: r.examples as string[],
          };
          return ok(proposeTasteRule(input) as unknown as Record<string, unknown>);
        } catch (error) {
          return fail(error);
        }
      },
    });

    editor.add({
      name: "taste_list",
      description: "List taste rules in the project scope, optionally filtered by status.",
      input: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["pending", "active", "rejected"],
            description: "Only rules with this status.",
          },
        },
        additionalProperties: false,
      },
      options: { namespace: "olc" },
      execute: async (raw: unknown) => {
        const r = (raw ?? {}) as Record<string, unknown>;
        try {
          const config = loadConfig(dir);
          const input: ListTasteInput = {
            projectRoot: dir,
            config,
            status: r.status as ListTasteInput["status"],
          };
          return ok({ rules: listTasteRules(input) });
        } catch (error) {
          return fail(error);
        }
      },
    });

    editor.add({
      name: "taste_review",
      description:
        "Explicit user review of a pending taste rule: approve=true -> active, false -> rejected. Only pending can be reviewed.",
      input: {
        type: "object",
        properties: {
          name: { type: "string", description: "Rule name to review." },
          approve: { type: "boolean", description: "true=activate, false=reject." },
        },
        required: ["name", "approve"],
        additionalProperties: false,
      },
      options: { namespace: "olc" },
      execute: async (raw: unknown) => {
        const r = (raw ?? {}) as Record<string, unknown>;
        try {
          const config = loadConfig(dir);
          const input: ReviewTasteInput = {
            projectRoot: dir,
            config,
            name: r.name as string,
            approve: r.approve as boolean,
          };
          return ok(reviewTasteRule(input) as unknown as Record<string, unknown>);
        } catch (error) {
          return fail(error);
        }
      },
    });

    editor.add({
      name: "log_event",
      description: "Append one activity event to the project's daily log (scrubs secrets).",
      input: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: ["milestone", "checkpoint", "task-status", "decision", "verify", "session", "scope-change"],
            description: "Event kind.",
          },
          summary: { type: "string", description: "Non-empty summary." },
          taskId: { type: "string", description: "Related task id, if any." },
          details: { type: "string", description: "Optional longer details." },
          gitSha: { type: "string", description: "Optional checkpoint sha." },
          date: { type: "string", description: "ISO timestamp. Default now." },
        },
        required: ["kind", "summary"],
        additionalProperties: false,
      },
      options: { namespace: "olc" },
      execute: async (raw: unknown) => {
        const r = (raw ?? {}) as Record<string, unknown>;
        try {
          const config = loadConfig(dir);
          const args: LogEventArgs = {
            projectRoot: dir,
            config,
            event: {
              kind: r.kind as LogEventKind,
              summary: r.summary as string,
              taskId: r.taskId as string | undefined,
              details: r.details as string | undefined,
              gitSha: r.gitSha as string | undefined,
              date: r.date as string | undefined,
            },
          };
          const out = logEvent(args);
          return ok({ file: out.file, entry: out.entry });
        } catch (error) {
          return fail(error);
        }
      },
    });

    editor.add({
      name: "decision_record",
      description:
        "Record a design decision to decisions/<YYYY-MM-DD>-<slug>.md (create-only, never overwrites).",
      input: {
        type: "object",
        properties: {
          title: { type: "string", description: "Decision heading; also slugified into file name." },
          context: { type: "string", description: "Why this decision was needed." },
          decision: { type: "string", description: "The decision, plain words." },
          consequences: { type: "string", description: "What must be followed / what it costs." },
          status: { type: "string", description: "Decision status. Default 'decided'." },
          related: { type: "string", description: "Related doc links." },
          date: { type: "string", description: "YYYY-MM-DD for file name + frontmatter. Default today." },
        },
        required: ["title", "context", "decision", "consequences"],
        additionalProperties: false,
      },
      options: { namespace: "olc" },
      execute: async (raw: unknown) => {
        const r = (raw ?? {}) as Record<string, unknown>;
        try {
          const config = loadConfig(dir);
          const out = recordDecisionDoc(
            {
              title: r.title as string,
              context: r.context as string,
              decision: r.decision as string,
              consequences: r.consequences as string,
              status: r.status as string | undefined,
              related: r.related as string | undefined,
              date: r.date as string | undefined,
            },
            dir,
            config,
          );
          return ok({ file: out.file, date: out.date, status: out.status });
        } catch (error) {
          return fail(error);
        }
      },
    });

    editor.add({
      name: "session_summary",
      description:
        "Build the end-of-session plain-language summary (Indonesian), append a session log event, and return the markdown.",
      input: {
        type: "object",
        properties: {
          whatDone: { type: "array", items: { type: "string" }, description: "What was done this session." },
          verify: {
            type: "object",
            description:
              "Loose verification outcome (ok, results[], escalated[]). Omitted = no tests ran.",
          },
          testsNote: { type: "string", description: "Note when no tests ran." },
          checkpointSha: { type: "string", description: "Real checkpoint commit sha, if any." },
          checkpointTaskId: { type: "string", description: "Task the checkpoint belongs to." },
          blockedReason: { type: "string", description: "Why the session stopped without finishing." },
          remaining: { type: "array", items: { type: "string" }, description: "Unfinished work." },
          nextStep: { type: "string", description: "Next step, plain words." },
          date: { type: "string", description: "ISO timestamp. Default now." },
        },
        required: ["whatDone", "remaining", "nextStep"],
        additionalProperties: false,
      },
      options: { namespace: "olc" },
      execute: async (raw: unknown) => {
        const r = (raw ?? {}) as Record<string, unknown>;
        try {
          const config = loadConfig(dir);
          const input: SessionSummaryInput = {
            projectRoot: dir,
            config,
            whatDone: r.whatDone as string[],
            verifyOutcome: r.verify as SessionSummaryInput["verifyOutcome"],
            testsNote: r.testsNote as string | undefined,
            checkpointSha: r.checkpointSha as string | undefined,
            checkpointTaskId: r.checkpointTaskId as string | undefined,
            blockedReason: r.blockedReason as string | undefined,
            remaining: r.remaining as string[],
            nextStep: r.nextStep as string,
            date: r.date as string | undefined,
          };
          const result = buildSessionSummary(input);
          return ok({ markdown: result.markdown, logFile: result.logFile, date: result.date });
        } catch (error) {
          return fail(error);
        }
      },
    });
  });
}
