"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** Upload a document to the event (click or drop a file). It lands in "Shared by the team". */
export function FileUpload({ eventId }: { eventId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const router = useRouter();

  async function send(files: FileList | null) {
    const list = [...(files ?? [])];
    if (!list.length) return;
    setBusy(true);
    try {
      for (const file of list) {
        const body = new FormData();
        body.append("file", file);
        const r = await fetch(`/api/events/${eventId}/files`, { method: "POST", body });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error ?? "Upload failed");
      }
      toast.success(list.length > 1 ? `${list.length} files uploaded` : `${list[0].name} uploaded`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <motion.button
      type="button"
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.95 }}
      disabled={busy}
      onClick={() => input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        send(e.dataTransfer.files);
      }}
      className={cn("group flex h-9 items-center gap-2 rounded-lg border-[1.5px] border-ink px-3 text-sm font-semibold shadow-[2px_2px_0_0_#161514] transition-colors disabled:opacity-60", over ? "bg-mint" : "bg-tomato")}
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4 transition-transform group-hover:-translate-y-0.5" />}
      {busy ? "Uploading…" : over ? "Drop to upload" : "Upload a file"}
      <input ref={input} type="file" multiple hidden onChange={(e) => send(e.target.files)} />
    </motion.button>
  );
}
