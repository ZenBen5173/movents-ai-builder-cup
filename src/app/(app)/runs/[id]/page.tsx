import { notFound } from "next/navigation";
import { one } from "@/lib/db";
import { pageUser } from "@/lib/guard";
import { isMember } from "@/lib/members";
import type { AgentRun } from "@/lib/types";
import { RunTrace } from "@/components/app/run-trace";

export const dynamic = "force-dynamic";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await one<AgentRun & { by: string | null }>("SELECT r.*, u.name AS by FROM agent_runs r LEFT JOIN users u ON u.id = r.started_by WHERE r.id = $1", [id]);
  if (!run) notFound();
  const user = await pageUser();
  if (run.started_by !== user.id && !(run.event_id && (await isMember(user, run.event_id)))) notFound();
  return <RunTrace initial={JSON.parse(JSON.stringify(run))} />;
}
