import { requireUser } from "@/lib/session";
import { handle } from "@/lib/server/http";
import { findTool } from "@/lib/agent/registry";

export const maxDuration = 300;

/** Plain REST version of every MCP tool: POST /api/agent/tools/<name> with JSON arguments. */
export async function POST(req: Request, { params }: { params: Promise<{ name: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { name } = await params;
    const tool = findTool(name);
    if (!tool) throw new Error(`Unknown tool ${name}`);
    const args = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return tool.run(args, user);
  });
}
