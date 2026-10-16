import "server-only";
import { lookup } from "node:dns/promises";
import net from "node:net";
import https from "node:https";
import type { IncomingMessage } from "node:http";

/** Media types we store and serve. SVG and HTML are never accepted (script risk). */
const SIGNATURES: { mime: string; test: (b: Buffer) => boolean }[] = [
  { mime: "image/png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/gif", test: (b) => b.subarray(0, 4).toString("ascii") === "GIF8" },
  { mime: "image/webp", test: (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP" },
  { mime: "video/webm", test: (b) => b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) },
  { mime: "video/mp4", test: (b) => b.subarray(4, 8).toString("ascii") === "ftyp" && !/^qt/.test(b.subarray(8, 12).toString("ascii")) },
  { mime: "video/quicktime", test: (b) => b.subarray(4, 8).toString("ascii") === "ftyp" && /^qt/.test(b.subarray(8, 12).toString("ascii")) },
];

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 20 * 1024 * 1024;

/** The real type from the file's first bytes, or null if it isn't allowed. */
export function sniff(buf: Buffer) {
  return SIGNATURES.find((s) => s.test(buf))?.mime ?? null;
}

/** Validate bytes; returns the real type, the bytes and a data: URL. */
export function toMedia(buf: Buffer) {
  const mime = sniff(buf);
  if (!mime) throw new Error("Unsupported file. Use PNG, JPEG, WebP, GIF, MP4, WebM or MOV.");
  const max = mime.startsWith("video/") ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (buf.length > max) throw new Error(`File too large (max ${Math.round(max / 1024 / 1024)} MB).`);
  return { mime, buf, dataUrl: `data:${mime};base64,${buf.toString("base64")}` };
}

/** Decode a data: URL and validate what is really inside it. */
export function fromDataUrl(dataUrl: string) {
  const m = /^data:[^;,]*;base64,(.*)$/s.exec(dataUrl);
  if (!m) throw new Error("Expected a base64 data: URL");
  if (m[1].length > MAX_VIDEO_BYTES * 1.4) throw new Error("File too large");
  return toMedia(Buffer.from(m[1], "base64"));
}

function privateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19))
    );
  }
  const v = ip.toLowerCase();
  const v4 = v.match(/^(?:::ffff:|::|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) return privateIp(v4[1]);
  if (/^(::ffff:|64:ff9b:|2002:)/.test(v)) return true; // mapped/translated/6to4 forms we can't inspect
  return v === "::1" || v === "::" || /^(fc|fd|fe[89ab])/.test(v);
}

/** DNS lookup for the actual connection: every resolved address must be public, and the socket uses one of them. */
const safeLookup: net.LookupFunction = (hostname, options, callback) => {
  lookup(hostname, { all: true }).then(
    (addrs) => {
      if (!addrs.length || addrs.some((a) => privateIp(a.address))) return callback(new Error("Media URL points to a private address"), "", 4);
      const pick = addrs[0];
      if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: typeof addrs) => void)(null, addrs);
      callback(null, pick.address, pick.family);
    },
    (err) => callback(err, "", 4),
  );
};

function get(url: URL): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { lookup: safeLookup, timeout: 20_000, headers: { "user-agent": "Movents/2 (+media fetch)" } }, resolve);
    req.on("timeout", () => req.destroy(new Error("Media download timed out")));
    req.on("error", reject);
  });
}

/**
 * Download media from a public https URL: no private/internal hosts (checked
 * on the connection itself, so DNS tricks don't help), at most 3 redirects,
 * a timeout and a size cap.
 */
export async function fetchMedia(url: string) {
  let current = new URL(url);
  for (let hop = 0; hop < 4; hop++) {
    if (current.protocol !== "https:") throw new Error("Media URL must use https");
    if (net.isIP(current.hostname.replace(/^\[|\]$/g, "")) && privateIp(current.hostname.replace(/^\[|\]$/g, ""))) throw new Error("Media URL points to a private address");
    const res = await get(current);
    const status = res.statusCode ?? 0;
    if (status >= 300 && status < 400 && res.headers.location) {
      res.resume();
      current = new URL(res.headers.location, current);
      continue;
    }
    if (status < 200 || status >= 300) {
      res.resume();
      throw new Error(`Could not download media (${status})`);
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of res) {
      size += (chunk as Buffer).length;
      if (size > MAX_VIDEO_BYTES) {
        res.destroy();
        throw new Error("Media file too large");
      }
      chunks.push(chunk as Buffer);
    }
    return toMedia(Buffer.concat(chunks));
  }
  throw new Error("Too many redirects");
}
