import { NextResponse } from "next/server";
import { one } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { assertMemberOf } from "@/lib/members";
import { imageHref, setImage } from "@/lib/marketing";
import { appUrl, verifyToken } from "@/lib/appurl";
import { MAX_VIDEO_BYTES, toMedia } from "@/lib/media";
import { publicError } from "@/lib/errors";
import type { Creative } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Upload an image or video for a creative as the raw request body, e.g.
 * curl -X POST --data-binary @poster.png "<signed upload link from attach_creative_media>"
 * Lets an AI assistant attach a file it generated on its own machine.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // A signed link from attach_creative_media (which checked the caller is on the team), or a signed-in member.
  const signed = verifyToken(`upload:${id}`, new URL(req.url).searchParams.get("t"));
  const user = signed ? null : await currentUser();
  if (!signed && !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const c = await one<Pick<Creative, "id">>("SELECT id FROM creatives WHERE id = $1", [id]);
  if (!c) return NextResponse.json({ error: "Creative not found" }, { status: 404 });
  try {
    if (user) await assertMemberOf(user, "creatives", id);
    if (Number(req.headers.get("content-length") ?? 0) > MAX_VIDEO_BYTES) throw new Error("File too large");
    const media = toMedia(Buffer.from(await req.arrayBuffer()));
    const r = await setImage(id, media.dataUrl, user ? "upload" : "assistant");
    return NextResponse.json({ creative_id: id, attached: true, preview: r ? `${appUrl()}${imageHref(r)}` : null });
  } catch (e) {
    return NextResponse.json({ error: publicError(e) }, { status: 400 });
  }
}
