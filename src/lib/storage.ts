import "server-only";
import { del, get, put } from "@vercel/blob";

/**
 * Creative media lives in a private Vercel Blob store when one is connected
 * (BLOB_READ_WRITE_TOKEN, or BLOB_STORE_ID with Vercel OIDC). Without one —
 * local development — it stays in the database as a data: URL.
 * Files are never public: /api/creatives/[id]/image checks access and streams.
 */
export function blobEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

/** A new key per upload, so replaced media never hits a stale cache. */
export function mediaKey(creativeId: string, mime: string) {
  return `creatives/${creativeId}/${Date.now()}.${EXT[mime] ?? "bin"}`;
}

export async function putMedia(key: string, body: Buffer, mime: string) {
  await put(key, body, { access: "private", contentType: mime });
}

/** The blob's stream and metadata, or null if it is gone. */
export async function getMedia(key: string) {
  const r = await get(key, { access: "private" });
  return r && r.statusCode === 200 ? r : null;
}

/** Size and first bytes of a stored blob (enough to check its real type), or null if missing. */
export async function inspectMedia(key: string) {
  const r = await getMedia(key);
  if (!r) return null;
  const reader = r.stream.getReader();
  const chunks: Uint8Array[] = [];
  let n = 0;
  while (n < 16) {
    const { value, done } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    n += value.length;
  }
  await reader.cancel().catch(() => {});
  return { size: r.blob.size, head: Buffer.concat(chunks).subarray(0, 16) };
}

/** Best effort: a leftover file is harmless, a failed request must not break the caller. */
export async function deleteMedia(keys: (string | null | undefined)[]) {
  const list = keys.filter((k): k is string => Boolean(k));
  if (!list.length || !blobEnabled()) return;
  await del(list).catch((err) => console.error(JSON.stringify({ level: "warn", msg: "blob delete failed", keys: list, err: String(err) })));
}
