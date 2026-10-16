import { one } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/session";
import { handle } from "@/lib/server/http";
import { isMember } from "@/lib/members";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const run = await one<{ event_id: string | null; started_by: string | null }>("SELECT * FROM agent_runs WHERE id = $1", [id]);
    const allowed = run && (run.started_by === user.id || (run.event_id && (await isMember(user, run.event_id))));
    if (!allowed) throw new HttpError(404, "Run not found");
    return run;
  });
}
