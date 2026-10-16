import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { currentUser } from "@/lib/session";
import { assertMemberOf } from "@/lib/members";
import { uploadKeyOk } from "@/lib/marketing";
import { MAX_VIDEO_BYTES } from "@/lib/media";
import { blobEnabled } from "@/lib/storage";
import { rateLimit } from "@/lib/ratelimit";
import { publicError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "video/mp4", "video/webm", "video/quicktime"];

/**
 * Issues a short-lived token so the Marketing page can upload a file straight
 * to the private Blob store (no 4.5 MB function body limit). Only team members
 * of the creative's event get one, and only for that creative's own path.
 * The file is attached afterwards by finishCreativeUpload, which re-checks it.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!blobEnabled()) return NextResponse.json({ error: "File storage is not configured" }, { status: 400 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await assertMemberOf(user, "creatives", id);
    await rateLimit(`blob-upload:${user.id}`, 60, 3600);
    const body = (await req.json()) as HandleUploadBody;
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!uploadKeyOk(id, pathname)) throw new Error("Invalid upload path");
        return { allowedContentTypes: TYPES, maximumSizeInBytes: MAX_VIDEO_BYTES, addRandomSuffix: false, validUntil: Date.now() + 10 * 60_000 };
      },
    });
    return NextResponse.json(json);
  } catch (e) {
    return NextResponse.json({ error: publicError(e) }, { status: 400 });
  }
}
