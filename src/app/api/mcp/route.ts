import { NextResponse } from "next/server";
import { currentUser } from "@/lib/session";
import { TOOLS, annotationsFor, findTool } from "@/lib/agent/registry";
import { InvalidArgs } from "@/lib/agent/validate";
import { MCP_INSTRUCTIONS } from "@/lib/agent/guide";
import { appUrl } from "@/lib/appurl";
import { publicError } from "@/lib/errors";
import { rateLimit, RateLimitError } from "@/lib/ratelimit";
import type { User } from "@/lib/types";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Movents as an MCP server (Streamable HTTP transport, stateless, JSON
 * responses). Works with any MCP client: Claude, ChatGPT, Cursor and others.
 *
 * Auth: `Authorization: Bearer <token>`, either a personal API token from
 * Settings or an OAuth access token (clients discover the OAuth server from
 * the WWW-Authenticate header on a 401). The token's user and role apply:
 * a committee member's outbound actions land in the approval queue.
 */
type RpcReq = { jsonrpc?: string; id?: string | number | null; method?: unknown; params?: Record<string, unknown> };

const SUPPORTED = ["2025-06-18", "2025-03-26", "2024-11-05"];
const LATEST = SUPPORTED[0];

const rpcError = (id: RpcReq["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

function unauthorized() {
  const metadata = `${appUrl()}/.well-known/oauth-protected-resource`;
  return NextResponse.json(rpcError(null, -32001, "Sign in required. Connect with OAuth, or send Authorization: Bearer <Movents API token> (Settings → Connect your AI assistant)."), {
    status: 401,
    headers: { "www-authenticate": `Bearer resource_metadata="${metadata}"` },
  });
}

/** Browsers send Origin; MCP clients usually don't. A browser on another site must not reach this endpoint. */
function badOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host !== new URL(appUrl()).host && new URL(origin).host !== req.headers.get("host");
  } catch {
    return true;
  }
}

async function handleOne(msg: RpcReq, user: User) {
  if (!msg || typeof msg !== "object" || Array.isArray(msg)) return rpcError(null, -32600, "Invalid Request");
  const isNotification = msg.id === undefined;
  if (typeof msg.method !== "string") {
    // A JSON-RPC response from the client (we never send requests) or garbage.
    return isNotification || "result" in msg || "error" in msg ? null : rpcError(msg.id, -32600, "Invalid Request");
  }
  if (msg.jsonrpc !== "2.0") return isNotification ? null : rpcError(msg.id, -32600, "jsonrpc must be \"2.0\"");
  if (msg.method.startsWith("notifications/")) return null;
  const reply = (result: unknown) => ({ jsonrpc: "2.0", id: msg.id ?? null, result });

  switch (msg.method) {
    case "initialize": {
      const asked = String(msg.params?.protocolVersion ?? "");
      return reply({
        protocolVersion: SUPPORTED.includes(asked) ? asked : LATEST,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "movents", title: "Movents: campus event planning", version: "2.0.0" },
        instructions: MCP_INSTRUCTIONS,
      });
    }
    case "ping":
      return reply({});
    case "tools/list":
      return reply({
        tools: TOOLS.map((t) => ({ name: t.name, title: annotationsFor(t.name).title, description: t.description, inputSchema: t.inputSchema, annotations: annotationsFor(t.name) })),
      });
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      const tool = findTool(name);
      if (!tool) return rpcError(msg.id, -32602, `Unknown tool: ${name}`);
      try {
        await rateLimit(`mcp:${user.id}`, 600, 3600);
        const out = await tool.run((msg.params?.arguments as Record<string, unknown>) ?? {}, user);
        const structured = out && typeof out === "object" && !Array.isArray(out) ? (out as Record<string, unknown>) : { result: out };
        return reply({ content: [{ type: "text", text: JSON.stringify(out, null, 2) }], structuredContent: structured, isError: false });
      } catch (err) {
        if (err instanceof InvalidArgs) return rpcError(msg.id, -32602, err.message);
        const text = err instanceof RateLimitError ? err.message : publicError(err);
        return reply({ content: [{ type: "text", text: `Error: ${text}` }], isError: true });
      }
    }
    case "resources/list":
      return reply({ resources: [] });
    case "prompts/list":
      return reply({ prompts: [] });
    default:
      return isNotification ? null : rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

export async function POST(req: Request) {
  if (badOrigin(req)) return NextResponse.json(rpcError(null, -32000, "Origin not allowed"), { status: 403 });
  const user = await currentUser();
  if (!user) return unauthorized();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(rpcError(null, -32700, "Parse error"), { status: 400 });
  }
  const asked = req.headers.get("mcp-protocol-version");
  if (asked && !SUPPORTED.includes(asked)) return NextResponse.json(rpcError(null, -32600, `Unsupported MCP-Protocol-Version ${asked}`), { status: 400 });
  const headers = { "mcp-protocol-version": asked ?? LATEST };
  // Batches were removed from the 2025-06-18 spec; older clients may still send them.
  if (Array.isArray(body)) {
    if (!body.length || body.length > 20) return NextResponse.json(rpcError(null, -32600, "Invalid Request"), { status: 400 });
    const out = (await Promise.all(body.map((m) => handleOne(m as RpcReq, user)))).filter(Boolean);
    return out.length ? NextResponse.json(out, { headers }) : new NextResponse(null, { status: 202, headers });
  }
  const out = await handleOne(body as RpcReq, user);
  return out ? NextResponse.json(out, { headers }) : new NextResponse(null, { status: 202, headers });
}

/** No server-initiated stream: this server only answers requests. */
export async function GET() {
  return new NextResponse(null, { status: 405, headers: { allow: "POST" } });
}

/** Stateless server: there is no session to end. */
export async function DELETE() {
  return new NextResponse(null, { status: 405, headers: { allow: "POST" } });
}
