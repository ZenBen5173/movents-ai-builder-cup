import { serverMetadata } from "@/lib/oauth";
import { json, preflight } from "@/lib/oauth-http";

export const dynamic = "force-dynamic";
/** Some MCP clients look for OpenID discovery first; same OAuth metadata. */
export const GET = () => json(serverMetadata());
export const OPTIONS = preflight;
