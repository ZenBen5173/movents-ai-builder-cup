import { resourceMetadata } from "@/lib/oauth";
import { json, preflight } from "@/lib/oauth-http";

export const dynamic = "force-dynamic";
export const GET = () => json(resourceMetadata());
export const OPTIONS = preflight;
