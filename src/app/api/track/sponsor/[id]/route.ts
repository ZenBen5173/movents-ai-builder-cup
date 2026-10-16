import { query } from "@/lib/db";
import { appUrl, verifyToken } from "@/lib/appurl";

export const dynamic = "force-dynamic";

const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

/** Open-tracking pixel in sponsor emails: contacted → opened. Views from inside the app's Inbox are ignored. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const ref = req.headers.get("referer") ?? "";
  const inApp = /(?:^|;\s*)ep_uid=/.test(req.headers.get("cookie") ?? "") || (ref && [url.origin, appUrl()].some((o) => ref.startsWith(o)));
  if (!inApp && verifyToken(`track:${id}`, url.searchParams.get("t"))) {
    await query("UPDATE sponsors SET status = 'opened', opened_at = now() WHERE id = $1 AND status = 'contacted'", [id]).catch(() => null);
  }
  return new Response(new Uint8Array(GIF), {
    headers: { "content-type": "image/gif", "content-length": String(GIF.length), "cache-control": "no-store, no-cache, must-revalidate, max-age=0" },
  });
}
