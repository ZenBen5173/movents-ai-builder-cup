"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Check, Copy, Play, Plus } from "lucide-react";
import { toast } from "sonner";
import { runSchedulerNow } from "@/app/actions";
import { createTokenAction, revokeGrantAction, revokeTokenAction } from "@/app/token-actions";
import { cn } from "@/lib/utils";

export type Integration = { name: string; mark: string; tone: string; live: boolean; mode: string; why: string; env: string };

function useCopy() {
  const [done, setDone] = useState(false);
  return {
    done,
    copy: (text: string) => {
      navigator.clipboard.writeText(text).then(
        () => {
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        },
        () => toast.error("Copy failed"),
      );
    },
  };
}

function CopyIcon({ text, label }: { text: string; label: string }) {
  const { done, copy } = useCopy();
  return (
    <motion.button whileTap={{ scale: 0.88 }} onClick={() => copy(text)} aria-label={label} title={label} className="grid size-8 shrink-0 place-items-center rounded-lg border-[1.5px] border-ink bg-card transition-colors hover:bg-sand/60">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={done ? "y" : "n"} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} transition={{ duration: 0.12 }}>
          {done ? <Check className="size-3.5 text-[#2a7e3b]" /> : <Copy className="size-3.5" />}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}

const Surface = ({ title, right, children, className }: { title: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) => (
  <section className={cn("rounded-xl border-[1.5px] border-ink bg-card p-5", className)}>
    <div className="mb-4 flex items-center justify-between gap-2">
      <h2 className="mono-label font-bold text-ink">{title}</h2>
      {right}
    </div>
    {children}
  </section>
);

type Token = { id: string; name: string; prefix: string; created_at: string; last_used_at: string | null };
type Grant = { client_id: string; name: string; created_at: string };

export function SettingsClient({ mcpUrl, tokens, grants, integrations, isFinal }: { mcpUrl: string; tokens: Token[]; grants: Grant[]; integrations: Integration[]; isFinal: boolean }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <ConnectAI mcpUrl={mcpUrl} tokens={tokens} grants={grants} />
      <div className="space-y-5">
        <Integrations items={integrations} />
        {isFinal && <Admin />}
      </div>
    </div>
  );
}

const ago = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "never");

function ConnectAI({ mcpUrl, tokens, grants }: { mcpUrl: string; tokens: Token[]; grants: Grant[] }) {
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const field = "flex h-8 min-w-0 flex-1 items-center overflow-x-auto whitespace-nowrap rounded-lg border-[1.5px] border-ink bg-background px-2.5 font-mono text-xs";
  const create = () =>
    start(async () => {
      const r = await createTokenAction(name || "AI assistant");
      if (!r.ok) return void toast.error(r.error);
      setFresh(r.data ?? null);
      setName("");
      router.refresh();
    });
  const revoke = (t: Token) => {
    if (!window.confirm(`Revoke "${t.name}"? Apps using it stop working.`)) return;
    start(async () => {
      const r = await revokeTokenAction(t.id);
      if (!r.ok) return void toast.error(r.error);
      router.refresh();
    });
  };
  const disconnect = (g: Grant) =>
    start(async () => {
      const r = await revokeGrantAction(g.client_id);
      if (!r.ok) return void toast.error(r.error);
      router.refresh();
    });
  const tok = fresh ?? "<your token>";
  const json = JSON.stringify({ mcpServers: { movents: { type: "http", url: mcpUrl, headers: { Authorization: `Bearer ${tok}` } } } }, null, 2);
  const cli = `claude mcp add --transport http movents ${mcpUrl} --header "Authorization: Bearer ${tok}"`;
  return (
    <Surface title="Connect your AI assistant">
      <div className="space-y-5 text-sm">
        <p className="text-muted-foreground">
          Movents is an MCP server. Any assistant that supports MCP (Claude, ChatGPT, Cursor, and others) can plan events with it, acting as you with your permissions.
        </p>
        <div>
          <p className="mono-label mb-1 text-[10px] text-muted-foreground">Server URL</p>
          <div className="flex gap-1.5">
            <code className={field}>{mcpUrl}</code>
            <CopyIcon text={mcpUrl} label="Copy URL" />
          </div>
        </div>

        <div className="rounded-lg bg-sand/50 p-3">
          <p className="font-semibold">Apps with a &ldquo;Connect&rdquo; button</p>
          <p className="mt-1 text-muted-foreground">
            Claude (claude.ai and desktop), ChatGPT and others: add a custom connector, paste the server URL, then sign in to Movents when asked. No token needed.
          </p>
        </div>

        <div>
          <p className="font-semibold">Apps configured with a file or command</p>
          <p className="mt-1 text-muted-foreground">Claude Code, Cursor, Windsurf and similar: create a personal token, then paste the snippet.</p>
          <div className="mt-2 flex gap-1.5">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Token name, e.g. Cursor on laptop" className="h-8 min-w-0 flex-1 rounded-lg border-[1.5px] border-ink bg-background px-2.5 text-xs" />
            <button onClick={create} disabled={pending} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-ink px-3 text-xs font-medium text-white disabled:opacity-50">
              <Plus className="size-3.5" /> Create token
            </button>
          </div>
          {fresh && (
            <div className="mt-3 space-y-2 rounded-lg border-[1.5px] border-ink bg-sun/30 p-3">
              <p className="text-xs font-semibold">Copy this token now. You won&apos;t see it again.</p>
              <div className="flex gap-1.5">
                <code className={field}>{fresh}</code>
                <CopyIcon text={fresh} label="Copy token" />
              </div>
            </div>
          )}
          <div className="mt-3 space-y-2">
            <p className="mono-label text-[10px] text-muted-foreground">Claude Code</p>
            <div className="flex gap-1.5">
              <code className={field}>{cli}</code>
              <CopyIcon text={cli} label="Copy command" />
            </div>
            <p className="mono-label text-[10px] text-muted-foreground">Cursor, Claude Desktop config and others (mcp.json)</p>
            <div className="flex gap-1.5">
              <pre className="min-w-0 flex-1 overflow-x-auto rounded-lg border-[1.5px] border-ink bg-background p-2.5 font-mono text-[11px]">{json}</pre>
              <CopyIcon text={json} label="Copy config" />
            </div>
          </div>
          {tokens.length > 0 && (
            <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
              {tokens.map((t) => (
                <li key={t.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{t.name}</span>
                    <span className="block text-muted-foreground">{t.prefix}… · created {ago(t.created_at)} · last used {ago(t.last_used_at)}</span>
                  </span>
                  <button onClick={() => revoke(t)} disabled={pending} className="rounded-md px-2 py-1 text-tomato-ink hover:bg-peach">Revoke</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {grants.length > 0 && (
          <div>
            <p className="font-semibold">Connected apps</p>
            <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
              {grants.map((g) => (
                <li key={g.client_id} className="flex items-center gap-2 px-3 py-2 text-xs">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{g.name}</span>
                    <span className="block text-muted-foreground">connected {ago(g.created_at)}</span>
                  </span>
                  <button onClick={() => disconnect(g)} disabled={pending} className="rounded-md px-2 py-1 text-tomato-ink hover:bg-peach">Disconnect</button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Surface>
  );
}

function Integrations({ items }: { items: Integration[] }) {
  const live = items.filter((i) => i.live).length;
  return (
    <Surface title="Integrations" right={<span className="mono-label text-[10px] text-muted-foreground">{live}/{items.length} live</span>}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {items.map((it, i) => (
          <Tile key={it.name} it={it} i={i} />
        ))}
      </div>
      <div className="mt-3 flex gap-4 font-mono text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#46a758]" />Live</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-sun" />Off</span>
      </div>
    </Surface>
  );
}

function Tile({ it, i }: { it: Integration; i: number }) {
  const [pos, setPos] = useState({ x: 50, y: 50 });
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.1 + i * 0.035, duration: 0.25 }}
      whileHover={{ y: -2 }}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setPos({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
      }}
      tabIndex={0}
      className="group relative flex flex-col items-center gap-2 rounded-lg border-[1.5px] border-ink bg-background px-2 pb-2.5 pt-3 outline-none transition-shadow hover:shadow-[2px_2px_0_0_#161514] focus-visible:shadow-[2px_2px_0_0_#161514]"
    >
      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-lg opacity-0 transition-opacity group-hover:opacity-100" style={{ background: `radial-gradient(120px circle at ${pos.x}% ${pos.y}%, rgba(255,216,77,.35), transparent 60%)` }} />
      <span className={cn("absolute right-1.5 top-1.5 size-2 rounded-full border border-ink/40", it.live ? "bg-[#46a758]" : "bg-sun")} />
      <span className={cn("relative grid size-10 place-items-center rounded-lg border-[1.5px] border-ink font-display text-sm font-bold transition-transform duration-200 group-hover:-rotate-6", it.tone)}>{it.mark}</span>
      <span className="relative text-xs font-medium">{it.name}</span>
      <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 w-56 -translate-x-1/2 translate-y-1 rounded-lg border-[1.5px] border-ink bg-card p-3 text-left text-xs opacity-0 shadow-[2px_2px_0_0_#161514] transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
        <p className="flex items-center gap-1.5 font-semibold">
          <span className={cn("size-2 rounded-full", it.live ? "bg-[#46a758]" : "bg-sun")} />
          {it.mode}
        </p>
        <p className="mt-1 text-muted-foreground">{it.why}</p>
        <p className="mt-2 break-all font-mono text-[10px] text-ink/70">{it.env}</p>
      </div>
    </motion.div>
  );
}

function Admin() {
  const [log, setLog] = useState<string[] | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = () =>
    start(async () => {
      const r = await runSchedulerNow();
      if (!r.ok) return void toast.error(r.error);
      const actions = (r.data as { actions?: string[] } | undefined)?.actions ?? [];
      toast.success("Scheduler ran");
      setLog(actions.length ? actions : ["Nothing due"]);
      router.refresh();
    });
  return (
    <Surface title="Daily automations">
      <p className="mb-3 text-sm text-muted-foreground">Reminders, follow-ups and budget alerts run every morning. Run them now for your society.</p>
      <motion.button whileTap={{ scale: 0.95 }} onClick={run} disabled={pending} className="inline-flex h-8 items-center gap-1.5 rounded-lg border-[1.5px] border-ink bg-sun px-3 text-sm font-medium transition-shadow hover:shadow-[2px_2px_0_0_#161514] disabled:opacity-50">
        <Play className="size-3.5" />
        {pending ? "Running" : "Run now"}
      </motion.button>
      <AnimatePresence>
        {log && (
          <motion.ul initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-3 space-y-1 overflow-hidden rounded-lg bg-sand/50 p-3 font-mono text-[11px]">
            {log.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </Surface>
  );
}
