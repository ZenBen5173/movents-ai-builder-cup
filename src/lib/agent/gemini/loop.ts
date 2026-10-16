import "server-only";
import { gemini, type Content, type FunctionDecl } from "../../ai/gemini";
import { TOOLS, findTool } from "../registry";
import { withAgent } from "../context";
import type { Run } from "../run";
import type { User } from "../../types";

export type ToolCallLog = { name: string; args: Record<string, unknown>; result?: unknown; error?: string };

/** Arguments the agent never chooses: the run and the event are fixed for it. */
const FIXED = new Set(["run_id", "event_id"]);

/** A registry tool as a Gemini function declaration, minus the fixed arguments. */
export function declaration(name: string): FunctionDecl {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`Unknown tool ${name}`);
  const props = Object.fromEntries(Object.entries(tool.inputSchema.properties).filter(([k]) => !FIXED.has(k)));
  const required = (tool.inputSchema.required ?? []).filter((k) => !FIXED.has(k));
  return { name, description: tool.description, parametersJsonSchema: { type: "object", properties: props, ...(required.length ? { required } : {}) } };
}

/** Keep what goes back to the model small: long tool results cost tokens and add nothing. */
export function compact(v: unknown, max = 6000): unknown {
  const s = JSON.stringify(v ?? null);
  if (s.length <= max) return v ?? null;
  return { truncated: true, preview: s.slice(0, max) };
}

/**
 * One agent: Gemini decides which of its tools to call, Movents runs them
 * (with the caller's membership and role checks), and the results go back
 * to Gemini until it answers in text. Tool errors are returned to the model
 * so it can correct itself. Every call lands in the run's live trace.
 */
export async function runToolAgent(opts: {
  run: Run;
  user: User;
  eventId: string;
  label: string;
  system: string;
  task: string;
  tools: string[];
  maxTurns?: number;
}): Promise<{ text: string; log: ToolCallLog[]; model: string; turns: number }> {
  const { run, user, eventId } = opts;
  const functions = opts.tools.map(declaration);
  const contents: Content[] = [{ role: "user", parts: [{ text: opts.task }] }];
  const log: ToolCallLog[] = [];
  let model: string | undefined;
  return withAgent({ run, label: opts.label, requireApproval: true }, async () => {
    const max = opts.maxTurns ?? 8;
    for (let turn = 1; turn <= max; turn++) {
      const r = await gemini({ system: opts.system, contents, functions, model });
      model = r.model;
      contents.push(r.content);
      if (!r.calls.length) return { text: r.text.trim(), log, model: r.model, turns: turn };
      const replies = [];
      for (const call of r.calls) {
        const entry: ToolCallLog = { name: call.name, args: call.args };
        log.push(entry);
        let response: Record<string, unknown>;
        if (!opts.tools.includes(call.name)) {
          entry.error = `Tool ${call.name} is not available to this agent`;
          response = { error: entry.error };
        } else {
          try {
            const out = await findTool(call.name)!.run({ ...call.args, event_id: eventId, run_id: run.id }, user);
            entry.result = out;
            response = { result: compact(out) };
          } catch (err) {
            entry.error = err instanceof Error ? err.message : String(err);
            response = { error: entry.error };
          }
        }
        replies.push({ functionResponse: { ...(call.id ? { id: call.id } : {}), name: call.name, response } });
      }
      contents.push({ role: "user", parts: replies });
    }
    return { text: "Stopped after the maximum number of steps.", log, model: model ?? "", turns: max };
  });
}
