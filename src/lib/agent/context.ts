import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Run } from "./run";

/**
 * What the in-app Gemini agents carry through every tool call:
 * - run: the one live Run object, shared by agents working in parallel, so
 *   their steps land in the same trace instead of overwriting each other.
 * - label: who is acting ("Gemini · budget agent"), shown on each step.
 * - requireApproval: outbound actions always queue for a human, whatever the
 *   caller's role. An AI never sends email or publishes on its own.
 */
export type AgentContext = { run: Run; label: string; requireApproval: boolean };

const store = new AsyncLocalStorage<AgentContext>();

export function withAgent<T>(ctx: AgentContext, fn: () => Promise<T>): Promise<T> {
  return store.run(ctx, fn);
}

export function agentContext(): AgentContext | undefined {
  return store.getStore();
}
