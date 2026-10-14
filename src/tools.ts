/**
 * OLC plugin tools.
 *
 * Exposes OLC's library modules as agent-callable tools under the `olc`
 * namespace so that agents can log events and produce a session summary.
 *
 * Safety:
 * - Every tool resolves `loadConfig(ctx.location.directory)` inside a try and
 *   maps module errors (ConfigError/IdentityError/LogError/VaultError/
 *   BuildError) to `{ ok: false, error: { code, message } }`.
 *   Modules self-gate identity (`validateIdentity`) before any read/write, so a
 *   wrong/missing project or vault never leaks writes to the wrong place.
 * - No file writes happen at plugin load or tool registration — only when a
 *   tool's `execute` runs (matching OLC-011's no-surprise-writes rule).
 */

import type { Plugin } from "@opencode/plugin";

import { loadConfig } from "./config/index.js";
import { logEvent, type LogEventArgs, type LogEventKind } from "./log/index.js";
import { buildSessionSummary, type SessionSummaryInput } from "./session/index.js";

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
