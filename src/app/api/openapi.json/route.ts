import { NextResponse } from "next/server";
import { TOOLS } from "@/lib/agent/registry";
import { appUrl } from "@/lib/appurl";

export const dynamic = "force-dynamic";

export async function GET() {
  const paths: Record<string, unknown> = {
    "/api/agent/run": {
      post: {
        summary: "Start an agent run from one prompt",
        requestBody: { content: { "application/json": { schema: { type: "object", properties: { prompt: { type: "string" } }, required: ["prompt"] } } } },
        responses: { 200: { description: "run_id" } },
      },
    },
    "/api/runs/{id}": {
      get: {
        summary: "Agent run with live step trace",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "AgentRun" } },
      },
    },
  };
  for (const t of TOOLS) {
    paths[`/api/agent/tools/${t.name}`] = {
      post: { operationId: t.name, summary: t.description, requestBody: { content: { "application/json": { schema: t.inputSchema } } }, responses: { 200: { description: "Tool result" } } },
    };
  }
  return NextResponse.json({
    openapi: "3.1.0",
    info: { title: "Movents agent API", version: "1.0.0", description: "Tools AI assistants use to plan campus events. The same tools are exposed over MCP at /api/mcp." },
    servers: [{ url: appUrl() }],
    components: { securitySchemes: { bearer: { type: "http", scheme: "bearer" } } },
    security: [{ bearer: [] }],
    paths,
  });
}
