"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Check, Copy, Download, Film, ImagePlus, Link2, Send, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { upload } from "@vercel/blob/client";
import { finishCreativeUpload, genKit, markCreativePosted, regenCreative, requestSocial, saveCreativeCopy } from "@/app/actions";
import { ActionButton } from "./action-button";
import { Pill } from "./ui";
import { cn } from "@/lib/utils";

export type KitItem = {
  id: string;
  kind: string;
  channel: string;
  title: string;
  caption: string;
  hashtags: string | null;
  image_prompt: string | null;
  image_source: string;
  width: number;
  height: number;
  status: string;
  posted_url: string | null;
  href: string;
  video: boolean;
};

function CopyBtn({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={() => {
        navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
      className="inline-flex h-7 items-center gap-1 rounded-lg border border-border px-2 text-xs hover:bg-accent"
    >
      {done ? <Check className="size-3.5 text-[var(--grass-11)]" /> : <Copy className="size-3.5" />}
      {done ? "Copied" : label}
    </motion.button>
  );
}

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };
const MAX = { image: 8 * 1024 * 1024, video: 20 * 1024 * 1024 };

/** Blob store connected: upload straight to it, then attach. Otherwise (local dev) POST the bytes to the app. */
async function sendFile(creativeId: string, f: File, blob: boolean): Promise<{ ok: boolean; error?: string }> {
  const ext = EXT[f.type];
  if (!ext) return { ok: false, error: "Use PNG, JPEG, WebP, GIF, MP4, WebM or MOV." };
  const max = f.type.startsWith("video/") ? MAX.video : MAX.image;
  if (f.size > max) return { ok: false, error: `Max ${max / 1024 / 1024} MB for this file type.` };
  if (blob) {
    const key = `creatives/${creativeId}/${Date.now()}.${ext}`;
    await upload(key, f, { access: "private", handleUploadUrl: `/api/creatives/${creativeId}/blob-upload`, contentType: f.type });
    return finishCreativeUpload(creativeId, key);
  }
  const res = await fetch(`/api/creatives/${creativeId}/upload`, { method: "POST", body: f, headers: { "content-type": f.type } });
  return res.ok ? { ok: true } : { ok: false, error: ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Upload failed" };
}

const SOURCE: Record<string, string> = { template: "Branded template", "nano-banana": "Nano Banana", assistant: "AI assistant", upload: "Uploaded" };

function KitCard({ c, index, nano, blob }: { c: KitItem; index: number; nano: boolean; blob: boolean }) {
  const [caption, setCaption] = useState(c.caption);
  const [tags, setTags] = useState(c.hashtags ?? "");
  const [postUrl, setPostUrl] = useState(c.posted_url ?? "");
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [, start] = useTransition();
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const isVideoKind = c.kind === "video";
  const save = () => {
    if (caption === c.caption && tags === (c.hashtags ?? "")) return;
    start(async () => {
      const r = await saveCreativeCopy(c.id, caption, tags);
      if (!r.ok) toast.error(r.error);
      else toast.success("Caption saved");
    });
  };
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06, duration: 0.4, ease: [0.16, 1, 0.3, 1] }} className="relative flex flex-col rounded-2xl border-[1.5px] border-ink bg-card shadow-pop">
      <span aria-hidden className="absolute -top-2.5 left-1/2 z-10 h-5 w-24 -translate-x-1/2 rotate-[-2deg] bg-[#e9e3d4]/95" />
      <div
        className="relative grid place-items-center rounded-t-2xl bg-sand/50 p-4 paper-grain [perspective:900px]"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setTilt({ x: ((e.clientY - r.top) / r.height - 0.5) * -8, y: ((e.clientX - r.left) / r.width - 0.5) * 10 });
        }}
        onMouseLeave={() => setTilt({ x: 0, y: 0 })}
      >
        <motion.div animate={{ rotateX: tilt.x, rotateY: tilt.y }} transition={{ type: "spring", stiffness: 200, damping: 18 }} className="relative w-full overflow-hidden rounded-xl shadow-xl" style={{ aspectRatio: `${c.width} / ${c.height}`, maxHeight: 340, width: c.width >= c.height ? "100%" : `${(340 * c.width) / c.height}px` }}>
          {c.video ? (
            <video src={c.href} controls playsInline className="size-full object-cover" />
          ) : (
             
            <img src={c.href} alt={c.title} className="size-full object-cover" loading="lazy" />
          )}
          {isVideoKind && !c.video && (
            <span className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-black/60 px-3 py-2 text-xs text-white"><Film className="size-3.5" />Cover frame, video is generated by your AI assistant</span>
          )}
        </motion.div>
        <div className="absolute left-3 top-3 flex gap-1.5">
          <span className="rounded-full bg-background/90 px-2 py-0.5 text-[11px] font-medium backdrop-blur">{c.channel}</span>
        </div>
        <div className="absolute right-3 top-3"><Pill status={c.status === "posted" ? "done" : c.status} label={c.status.replace("_", " ")} /></div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">{c.title}</p>
          <span className="text-[11px] text-muted-foreground">{SOURCE[c.image_source] ?? c.image_source}</span>
        </div>
        <textarea value={caption} onChange={(e) => setCaption(e.target.value)} onBlur={save} rows={isVideoKind ? 7 : 5} className="w-full resize-y rounded-lg border border-input bg-transparent p-2 text-xs leading-relaxed outline-none focus:ring-2 focus:ring-ring" />
        {c.kind !== "poster" && <input value={tags} onChange={(e) => setTags(e.target.value)} onBlur={save} placeholder="#hashtags" className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-xs text-primary outline-none focus:ring-2 focus:ring-ring" />}
        <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
          <CopyBtn text={tags ? `${caption}\n\n${tags}` : caption} label="Copy caption" />
          {c.image_prompt && <CopyBtn text={c.image_prompt} label={isVideoKind ? "Copy video prompt" : "Copy Nano Banana prompt"} />}
          <a href={`${c.href}${c.href.includes("?") ? "&" : "?"}download`} className="inline-flex h-7 items-center gap-1 rounded-lg border border-border px-2 text-xs hover:bg-accent"><Download className="size-3.5" />Download</a>
          {nano && !isVideoKind && <ActionButton action={regenCreative.bind(null, c.id)} size="xs" icon={<Wand2 className="size-3.5" />}>Nano Banana</ActionButton>}
          <button onClick={() => file.current?.click()} className="inline-flex h-7 items-center gap-1 rounded-lg border border-border px-2 text-xs hover:bg-accent"><ImagePlus className="size-3.5" />Upload</button>
          <input
            ref={file}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              start(async () => {
                const r = await sendFile(c.id, f, blob).catch((err: unknown) => ({ ok: false, error: err instanceof Error ? err.message : "Upload failed" }));
                if (!r.ok) toast.error(r.error ?? "Upload failed");
                else toast.success("Media attached");
                router.refresh();
              });
            }}
          />
        </div>
        {(c.status === "approved" || c.status === "posted") && (
          <div className="flex gap-1.5">
            <input value={postUrl} onChange={(e) => setPostUrl(e.target.value)} placeholder="Link to the live post (optional)" className="h-7 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2 text-xs outline-none focus:ring-2 focus:ring-ring" />
            <ActionButton action={() => markCreativePosted(c.id, postUrl)} size="xs" variant={c.status === "posted" ? "outline" : "success"} icon={<Link2 className="size-3.5" />}>{c.status === "posted" ? "Update" : "Mark posted"}</ActionButton>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function MarketingKit({ eventId, items, nano, blob }: { eventId: string; items: KitItem[]; nano: boolean; blob: boolean }) {
  const drafts = items.filter((i) => i.status === "draft").length;
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <ActionButton action={genKit.bind(null, eventId)} variant="primary" icon={<Sparkles className="size-3.5" />}>{items.length ? "Refresh kit" : "Generate marketing kit"}</ActionButton>
        {drafts > 0 && <ActionButton action={requestSocial.bind(null, eventId)} icon={<Send className="size-3.5" />}>Send {drafts} for approval</ActionButton>}
        <span className={cn("text-xs text-muted-foreground")}>
          {nano ? "Images by Nano Banana (Gemini)." : "Branded template images. Your AI assistant can replace them via attach_creative_media, or set GEMINI_API_KEY to generate here."}
        </span>
      </div>
      <AnimatePresence>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No creatives yet.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((c, i) => <KitCard key={`${c.id}-${c.href}`} c={c} index={i} nano={nano} blob={blob} />)}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
