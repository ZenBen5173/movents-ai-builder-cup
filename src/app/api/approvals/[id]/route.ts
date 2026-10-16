import { requireUser } from "@/lib/session";
import { handle } from "@/lib/server/http";
import { decideApproval } from "@/lib/actions";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const { decision, note } = (await req.json()) as { decision: "approve" | "reject"; note?: string };
    return decideApproval(user, id, decision, note);
  });
}
