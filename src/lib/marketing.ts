import "server-only";
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, fetchMedia, fromDataUrl, sniff } from "./media";
import { blobEnabled, deleteMedia, inspectMedia, mediaKey, putMedia } from "./storage";
import { id, insert, one, query, update } from "./db";
import { appUrl, fmtDate } from "./appurl";
import { generateImage, nanoBananaEnabled } from "./integrations/nanobanana";
import type { Creative, EventRow, Speaker, Venue } from "./types";

type Ctx = { ev: EventRow; venue: Venue | null; society: string; speakers: Speaker[]; uni: string };

export const KINDS: { kind: Creative["kind"]; channel: string; title: string; width: number; height: number }[] = [
  { kind: "poster", channel: "Poster", title: "Campus poster (4:5)", width: 1080, height: 1350 },
  { kind: "ig_post", channel: "Instagram", title: "Instagram feed post (1:1)", width: 1080, height: 1080 },
  { kind: "ig_story", channel: "Instagram", title: "Instagram story (9:16)", width: 1080, height: 1920 },
  { kind: "linkedin", channel: "LinkedIn", title: "LinkedIn post image (1.91:1)", width: 1200, height: 627 },
  { kind: "video", channel: "Instagram Reels / TikTok", title: "15-second teaser video (9:16)", width: 1080, height: 1920 },
];

async function context(eventId: string): Promise<Ctx> {
  const ev = await one<EventRow>("SELECT * FROM events WHERE id = $1", [eventId]);
  if (!ev) throw new Error("Event not found");
  const venue = ev.venue_id ? await one<Venue>("SELECT * FROM venues WHERE id = $1", [ev.venue_id]) : null;
  const s = await one<{ name: string; uni: string }>("SELECT s.name, u.name AS uni FROM societies s JOIN universities u ON u.id = s.university_id WHERE s.id = $1", [ev.society_id]);
  const speakers = await query<Speaker>("SELECT * FROM speakers WHERE event_id = $1 ORDER BY status = 'confirmed' DESC, name", [eventId]);
  return { ev, venue, society: s?.name ?? "", speakers, uni: s?.uni ?? "" };
}

function weekday(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
}

function tags(c: Ctx) {
  const topic = (c.ev.topic ?? "").replace(/[^A-Za-z0-9]/g, "");
  const uni = c.uni.split(" ")[0];
  return [`#${uni}`, `#${uni}University`, topic && `#${topic}`, topic && `#${topic}Malaysia`, "#StudentLife", "#CampusEvents", "#KLevents"].filter(Boolean).join(" ");
}

/** Channel-specific copy. Written to be posted as-is; an AI assistant may rewrite it via update_creative_copy. */
export function copyFor(kind: Creative["kind"], c: Ctx) {
  const when = `${weekday(c.ev.date)}, ${fmtDate(c.ev.date)} · ${c.ev.start_time} to ${c.ev.end_time}`;
  const where = c.venue ? `${c.venue.name}, ${c.uni}` : c.uni;
  const link = `${appUrl()}/e/${c.ev.id}`;
  const named = c.speakers.filter((s) => !/^Sample Speaker/.test(s.name)).map((s) => s.name);
  const lineup = named.length ? named.join(", ") : "speakers from industry and research";
  switch (kind) {
    case "poster":
      return { caption: `${c.ev.title}\n${when}\n${where}\nFree entry · register: ${link}\nOrganised by ${c.society}`, hashtags: null };
    case "ig_post":
      return {
        caption: `🚀 ${c.ev.title} is happening!\n\nWant to know where ${c.ev.topic ?? "the field"} is heading, and how to get into it? Join ${lineup} for talks, live demos and an open Q&A.\n\n📅 ${when}\n📍 ${where}\n🎟️ Free, seats are limited, link in bio\n\nTag a friend who needs to be there 👇`,
        hashtags: tags(c),
      };
    case "ig_story":
      return { caption: `${c.ev.title}, ${fmtDate(c.ev.date)}. Swipe up / tap the link sticker to register: ${link}`, hashtags: tags(c) };
    case "linkedin":
      return {
        caption: `We're excited to announce ${c.ev.title}, hosted by the ${c.society}.\n\n${c.ev.topic ?? "This field"} is changing how every industry works. This session brings ${lineup} to ${c.uni} to share what they're building, what skills matter, and where students can start.\n\n🗓 ${when}\n📍 ${where}\n🔗 Register (free): ${link}\n\nIndustry partners interested in supporting future events, please reach out.`,
        hashtags: tags(c).split(" ").slice(0, 4).join(" "),
      };
    case "video":
      return {
        caption: `Storyboard (15s, 9:16):\n0 to 3s  Fast cuts of students on campus, text: "Curious about ${c.ev.topic ?? "the future"}?"\n3 to 7s  Title card "${c.ev.title}" with animated gradient\n7 to 11s  Speaker lineup / "Talks · Live demos · Q&A"\n11 to 15s  "${fmtDate(c.ev.date)} · ${c.venue?.name ?? c.uni}" + "Register free, link in bio"\nMusic: upbeat, royalty-free. On-screen text large, safe margins for Reels UI.`,
        hashtags: tags(c),
      };
  }
}

/** A striking hero scene for the event's topic, so the AI image has a real subject, not just text. */
function sceneFor(c: Ctx) {
  const t = `${c.ev.title} ${c.ev.topic ?? ""}`.toLowerCase();
  const scenes: [RegExp, string][] = [
    [/robot/, "a sleek humanoid robot and a robotic arm on a glowing stage, sparks of light, students silhouetted in the foreground"],
    [/hack|code|coding|dev|game/, "a crowd of students coding on laptops late at night, screens glowing with neon code, energy drinks and sticky notes, light trails overhead"],
    [/cloud|server|devops/, "a floating city of glowing server racks among soft clouds at sunrise, data streams of light connecting them"],
    [/\bai\b|artificial|machine learning|ml\b|data/, "a glowing translucent neural-network brain made of light hovering above an auditorium stage, students looking up in awe"],
    [/career|job|intern|recruit/, "confident students in smart casual clothes walking into a bright modern expo hall with company booths, city skyline through tall windows"],
    [/cyber|security/, "a glowing digital shield over a dark city grid, cyan light, a hooded figure dissolving into code"],
    [/music|concert|band|night|cultural|festival|dance/, "a vibrant crowd under colourful stage lights and confetti, hands in the air, festival atmosphere"],
    [/sport|run|futsal|tournament/, "dynamic athletes mid-action under stadium lights, motion blur and dust"],
  ];
  return scenes.find(([re]) => re.test(t))?.[1] ?? "an excited crowd of university students in a modern auditorium, a speaker on a lit stage, warm spotlight beams";
}

/** Prompt for an AI image model (Nano Banana or the assistant's image tool) or a video model. Real art direction, exact text. */
export function promptFor(kind: Creative["kind"], c: Ctx, w: number, h: number) {
  const where = c.venue?.name ?? c.uni;
  const look = `Style: high-end AI illustrated event key art, cinematic 3D render with rich depth, dramatic volumetric lighting, bold vibrant colours (electric blue, tomato orange and sunny yellow highlights), polished like a festival or tech-conference poster. Not flat, not a template, no plain background, no barcode, no ticket stub, no logos of real companies.`;
  const text = `Render only this text, spelled exactly, in a bold modern sans-serif with strong contrast: big headline "${c.ev.title}"; smaller line "${fmtDate(c.ev.date)} · ${where}"; small line "Free entry · Register now"; tiny line "${c.society}". No other words, no colour codes, no labels.`;
  if (kind === "video") return `A 15-second vertical (9:16) teaser video for "${c.ev.title}" by ${c.society} at ${c.uni}. Hero scene: ${sceneFor(c)}. Follow this storyboard: ${copyFor("video", c).caption.replace(/\n/g, " ")} ${look}`;
  const frame = {
    poster: `A ${w}x${h} portrait campus event poster. The hero scene fills the top two thirds; the text sits in the lower third over a darkened area.`,
    ig_post: `A ${w}x${h} square Instagram post. The hero scene fills the frame; the headline sits on a clear area at the top or bottom.`,
    ig_story: `A ${w}x${h} vertical Instagram story. Hero scene in the middle, headline near the top, keep the bottom 15% calm for a link sticker.`,
    linkedin: `A ${w}x${h} landscape LinkedIn banner. Hero scene on the right half, text on a clean area on the left half.`,
  }[kind];
  return `${frame} Hero scene: ${sceneFor(c)}. ${look} ${text}`;
}

export async function generateKit(eventId: string, opts: { withImages?: boolean } = {}) {
  const c = await context(eventId);
  const existing = await query<Creative>("SELECT * FROM creatives WHERE event_id = $1", [eventId]);
  const out: Creative[] = [];
  for (const k of KINDS) {
    const copy = copyFor(k.kind, c);
    const prompt = promptFor(k.kind, c, k.width, k.height);
    const prev = existing.find((e) => e.kind === k.kind);
    const row = prev
      ? (await update<Creative>("creatives", prev.id, { caption: copy.caption, hashtags: copy.hashtags, image_prompt: prompt, updated_at: new Date() }))!
      : await insert<Creative>("creatives", { id: id("crv"), event_id: eventId, kind: k.kind, channel: k.channel, title: k.title, caption: copy.caption, hashtags: copy.hashtags, image_prompt: prompt, width: k.width, height: k.height, image_source: "template" });
    out.push(row);
  }
  let generated = 0;
  const errors: string[] = [];
  if (opts.withImages && nanoBananaEnabled()) {
    for (const r of out.filter((x) => x.kind !== "video" && x.image_source === "template")) {
      try {
        await setImage(r.id, await generateImage(r.image_prompt!, r.width, r.height), "nano-banana");
        generated++;
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
  }
  return { creatives: out, generated, mode: nanoBananaEnabled() ? "nano-banana" : "template", errors };
}

/** Re-write every creative's image_prompt with the current art direction (keeps captions as edited). */
export async function refreshPrompts(eventId: string) {
  const c = await context(eventId);
  const rows = await query<Creative>("SELECT * FROM creatives WHERE event_id = $1 ORDER BY created_at", [eventId]);
  return Promise.all(rows.map(async (r) => (await update<Creative>("creatives", r.id, { image_prompt: promptFor(r.kind, c, r.width, r.height) })) ?? r));
}

/** Still the generated placeholder poster. */
export function needsImage(c: Pick<Creative, "kind" | "image_source" | "image_data">) {
  return c.image_source === "template";
}

/**
 * Attach media to a creative. Accepts a data: URL or a public https URL; the
 * bytes are checked (real PNG/JPEG/WebP/GIF/MP4/WebM/MOV, size-capped) and
 * stored, so the app never redirects to or embeds third-party URLs.
 * Stored in the private Blob store when connected, else in the row.
 */
export async function setImage(creativeId: string, image: string, source: Creative["image_source"]) {
  const media = image.startsWith("data:") ? fromDataUrl(image) : /^https:\/\//.test(image) ? await fetchMedia(image) : null;
  if (!media) throw new Error("Media must be an https URL or a base64 data: URL");
  const prev = await one<{ media_key: string | null }>("SELECT media_key FROM creatives WHERE id = $1", [creativeId]);
  if (!prev) throw new Error("Creative not found");
  let stored: { image_data: string | null; media_key: string | null } = { image_data: media.dataUrl, media_key: null };
  if (blobEnabled()) {
    const key = mediaKey(creativeId, media.mime);
    await putMedia(key, media.buf, media.mime);
    stored = { image_data: null, media_key: key };
  }
  const row = await update<Creative>("creatives", creativeId, { ...stored, media_type: media.mime, image_url: null, image_source: source, updated_at: new Date() });
  await deleteMedia([prev.media_key]);
  return row;
}

/** Blob pathnames a browser may upload to for this creative (see /api/creatives/[id]/blob-upload). */
export function uploadKeyOk(creativeId: string, key: string) {
  return key.startsWith(`creatives/${creativeId}/`) && /^creatives\/[\w-]+\/\d{10,16}\.(png|jpg|gif|webp|mp4|webm|mov)$/.test(key);
}

/**
 * Attach a file the browser uploaded straight to Blob. The upload token
 * already limited type and size; the bytes are checked again here, since
 * the declared content type comes from the client.
 */
export async function attachUploadedMedia(creativeId: string, key: string) {
  if (!blobEnabled() || !uploadKeyOk(creativeId, key)) throw new Error("Upload not recognised. Try again.");
  const prev = await one<{ media_key: string | null }>("SELECT media_key FROM creatives WHERE id = $1", [creativeId]);
  if (!prev) throw new Error("Creative not found");
  const info = await inspectMedia(key);
  if (!info) throw new Error("Upload not found. Try again.");
  const mime = sniff(info.head);
  const max = mime?.startsWith("video/") ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (!mime || info.size > max) {
    await deleteMedia([key]);
    throw new Error(!mime ? "Unsupported file. Use PNG, JPEG, WebP, GIF, MP4, WebM or MOV." : `File too large (max ${Math.round(max / 1024 / 1024)} MB).`);
  }
  const row = await update<Creative>("creatives", creativeId, { media_key: key, media_type: mime, image_data: null, image_url: null, image_source: "upload", updated_at: new Date() });
  if (prev.media_key !== key) await deleteMedia([prev.media_key]);
  return row;
}

export async function regenerateImage(creativeId: string) {
  const r = await one<Creative>("SELECT * FROM creatives WHERE id = $1", [creativeId]);
  if (!r) throw new Error("Creative not found");
  if (r.kind === "video") throw new Error("Generate the video with your AI assistant or another tool, then upload it here");
  if (!nanoBananaEnabled()) throw new Error("Image generation is not set up on this server. Upload an image, or ask your AI assistant to generate and attach one.");
  return setImage(r.id, await generateImage(r.image_prompt!, r.width, r.height), "nano-banana");
}

export function imageHref(c: Pick<Creative, "id" | "updated_at">) {
  return `/api/creatives/${c.id}/image?v=${new Date(c.updated_at).getTime()}`;
}

export function isVideo(c: Pick<Creative, "image_data" | "image_url" | "media_type">) {
  return Boolean(c.media_type?.startsWith("video/") || c.image_data?.startsWith("data:video/") || (c.image_url && /\.(mp4|webm|mov)(\?|$)/i.test(c.image_url)));
}
