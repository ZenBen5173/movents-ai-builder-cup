import "server-only";
import { id, insert, one, update } from "../db";
import { isMember } from "../members";
import type { AgentOutput, AgentRun, AgentStep, StepStatus, User } from "../types";

export type StepResult = {
  status?: StepStatus;
  output?: unknown;
  summary?: string;
  validation?: AgentStep["validation"];
  adapt?: string;
};

/** A recorded agent run. Every step is persisted as it happens so the UI can show it live. */
export class Run {
  steps: AgentStep[] = [];
  outputs: AgentOutput[] = [];
  eventId: string | null = null;

  constructor(public id: string, public user: User, public prompt: string) {}

  static async start(user: User, prompt: string, kind: AgentRun["kind"], source: AgentRun["source"] = "builtin") {
    const runId = id("run");
    await insert("agent_runs", { id: runId, prompt, kind, source, status: "running", steps: [], outputs: [], started_by: user.id });
    return new Run(runId, user, prompt);
  }

  /** A run the user started, or one on an event they are on. Others read as missing. */
  static async load(runId: string, user: User) {
    const row = await one<AgentRun>("SELECT * FROM agent_runs WHERE id = $1", [runId]);
    if (!row) return null;
    if (row.started_by !== user.id && !(row.event_id && (await isMember(user, row.event_id)))) return null;
    const r = new Run(row.id, user, row.prompt);
    r.steps = row.steps ?? [];
    r.outputs = row.outputs ?? [];
    r.eventId = row.event_id;
    return r;
  }

  private async save(extra: Record<string, unknown> = {}) {
    await update("agent_runs", this.id, { steps: this.steps, outputs: this.outputs, event_id: this.eventId, ...extra });
  }

  async setEvent(eventId: string) {
    this.eventId = eventId;
    await this.save();
  }

  /** Run one step: mark running, execute, record the result (or the failure). */
  async step<T extends StepResult>(name: string, tool: string, input: unknown, fn: () => Promise<T>): Promise<T> {
    const s: AgentStep = { id: `s${this.steps.length + 1}`, name, tool, status: "running", input, started_at: new Date().toISOString() };
    this.steps.push(s);
    await this.save();
    // Optional pause so a live trace is easy to follow in a walkthrough. Off by default.
    const pause = Number(process.env.AGENT_STEP_DELAY_MS ?? 0);
    if (pause) await new Promise((r) => setTimeout(r, pause));
    try {
      const res = await fn();
      Object.assign(s, {
        status: res.status ?? (res.validation?.some((v) => !v.passed) ? "warn" : "ok"),
        output: res.output,
        summary: res.summary,
        validation: res.validation,
        adapt: res.adapt,
        finished_at: new Date().toISOString(),
      });
      await this.save();
      return res;
    } catch (err) {
      Object.assign(s, { status: "fail", summary: err instanceof Error ? err.message : String(err), finished_at: new Date().toISOString() });
      await this.save();
      throw err;
    }
  }

  /** Record a step the AI assistant already performed outside Movents. */
  async record(step: Omit<AgentStep, "id" | "started_at"> & { started_at?: string }) {
    this.steps.push({ id: `s${this.steps.length + 1}`, started_at: new Date().toISOString(), finished_at: new Date().toISOString(), ...step });
    await this.save();
    return this.steps.at(-1)!;
  }

  async output(label: string, href: string, kind: string) {
    if (!this.outputs.some((o) => o.href === href)) this.outputs.push({ label, href, kind });
    await this.save();
  }

  async finish(summary: Record<string, unknown>, failed = false) {
    await this.save({ status: failed ? "failed" : "done", summary, finished_at: new Date() });
  }
}
