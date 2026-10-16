"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronRight, ChevronsUpDown, LogOut, Menu, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { signOut } from "@/app/auth-actions";
import { switchWorkspaceAction } from "@/app/workspace-actions";
import type { IconName } from "@/components/ep/icons";
import Breadcrumb from "@/components/smoothui/breadcrumb";
import { Bunting, Icon, ROLE_BAND, Wristband, useRowIcon } from "@/components/ep/kit";
import { SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { uniIcon } from "@/lib/uni-logos";
import { ROLE_LABEL, type Role } from "@/lib/types";

type ShellUser = { id: string; name: string; email: string; role: Role; department: string | null };
type WorkspaceItem = { society_id: string; name: string; university: string; role: Role; department: string | null };
type Note = { id: string; title: string; body: string; link: string; read: boolean; created_at: string };
type Project = { id: string; title: string; date: string; status: string; venue: string | null; open_tasks: number };

export const PROJECT_PAGES: { seg: string; label: string; icon: IconName }[] = [
  { seg: "", label: "Overview", icon: "layout-dashboard" },
  { seg: "tasks", label: "Tasks", icon: "list-checks" },
  { seg: "risks", label: "Risks", icon: "shield-alert" },
  { seg: "budget", label: "Budget", icon: "wallet" },
  { seg: "speakers", label: "Speakers", icon: "mic-vocal" },
  { seg: "suppliers", label: "Suppliers", icon: "store" },
  { seg: "sponsors", label: "Sponsors", icon: "handshake" },
  { seg: "promotion", label: "Marketing", icon: "megaphone" },
  { seg: "inbox", label: "Inbox", icon: "inbox" },
  { seg: "meetings", label: "Meetings", icon: "calendar-clock" },
  { seg: "day", label: "Run of show", icon: "clock-4" },
  { seg: "outputs", label: "Files", icon: "folder-open" },
  { seg: "activity", label: "Activity", icon: "history" },
];

const ADMIN: { href: string; label: string; icon: IconName }[] = [
  { href: "/audit", label: "Audit log", icon: "scroll-text" },
  { href: "/settings", label: "Settings", icon: "settings-2" },
];

type Uni = { id: string; name: string; short_name: string };

const UNI_PAGES: { seg: string; label: string; icon: IconName }[] = [
  { seg: "", label: "SOP library", icon: "book-open-text" },
  { seg: "venues", label: "Venues", icon: "building-2" },
  { seg: "vendors", label: "Vendors", icon: "store" },
];

const initials = (n: string) => n.replace(/^Dr\.\s*/, "").split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).toUpperCase();

function NavRow({ href, label, icon, active, badge, depth = 0, onNavigate }: { href: string; label: string; icon: IconName; active: boolean; badge?: number; depth?: number; onNavigate?: () => void }) {
  const row = useRowIcon();
  return (
    <Link
      href={href}
      onClick={onNavigate}
      data-nav-row
      onMouseEnter={row.onMouseEnter}
      onMouseLeave={row.onMouseLeave}
      className={cn("relative z-10 flex h-8 items-center gap-2.5 rounded-lg pr-2 text-[13.5px] transition-colors", active ? "font-semibold text-ink" : "text-ink/70 hover:text-ink")}
      style={{ paddingLeft: 10 + depth * 18 }}
    >
      {active && <motion.span layoutId="nav-active" className="absolute inset-0 -z-10 rounded-lg border-[1.5px] border-ink bg-card shadow-[2px_2px_0_0_#161514]" transition={SPRING.default} />}
      <Icon ref={row.ref} name={icon} size={15} manual className={active ? "text-tomato" : ""} />
      <span className="truncate">{label}</span>
      {!!badge && <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-tomato px-1.5 text-[11px] font-bold text-ink">{badge}</span>}
    </Link>
  );
}

function ProjectNode({ p, path, onNavigate }: { p: Project; path: string; onNavigate?: () => void }) {
  const base = `/events/${p.id}`;
  const inside = path.startsWith(base);
  const [open, setOpen] = useState(inside);
  useEffect(() => {
    if (inside) setOpen(true);
  }, [inside]);
  const dot = p.status === "completed" ? "bg-ticket-blue" : p.status === "approved" || p.status === "live" ? "bg-[#46a758]" : p.status === "pending_approval" ? "bg-sun" : "bg-tomato";
  return (
    <div>
      <div data-nav-row className="group relative z-10 flex h-8 items-center rounded-lg pl-1 pr-2 text-[13.5px]">
        <button onClick={() => setOpen((o) => !o)} aria-label={open ? "Collapse" : "Expand"} className="grid size-6 place-items-center rounded text-ink/50 hover:bg-sand hover:text-ink">
          <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        </button>
        <Link href={base} onClick={onNavigate} className={cn("group flex min-w-0 flex-1 items-center gap-2", inside ? "font-semibold" : "text-ink/80")}>
          <span className={cn("size-2 shrink-0 rounded-full ring-2 ring-white", dot)} />
          <span className="truncate">{p.title}</span>
        </Link>
        <span className="mono-label ml-2 text-[9.5px] font-bold text-ink">{fmt(p.date)}</span>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="relative overflow-hidden">
            <span aria-hidden className="absolute bottom-2 left-[17px] top-1 w-px bg-border" />
            {PROJECT_PAGES.map((pg) => {
              const href = pg.seg ? `${base}/${pg.seg}` : base;
              const active = pg.seg ? path.startsWith(href) : path === base;
              return <NavRow key={pg.seg} href={href} label={pg.label} icon={pg.icon} active={active} depth={1} onNavigate={onNavigate} badge={pg.seg === "tasks" && p.open_tasks ? undefined : undefined} />;
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function UniNode({ u, path, onNavigate }: { u: Uni; path: string; onNavigate?: () => void }) {
  const base = `/universities/${u.id}`;
  const inside = path.startsWith(base);
  const [open, setOpen] = useState(inside);
  useEffect(() => {
    if (inside) setOpen(true);
  }, [inside]);
  return (
    <div>
      <div data-nav-row className="relative z-10 flex h-8 items-center rounded-lg pl-1 pr-2 text-[13.5px]">
        <button onClick={() => setOpen((o) => !o)} aria-label={open ? "Collapse" : "Expand"} className="grid size-6 place-items-center rounded text-ink/50 hover:bg-sand hover:text-ink">
          <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        </button>
        <Link href={base} onClick={onNavigate} className={cn("flex min-w-0 flex-1 items-center gap-2", inside ? "font-semibold" : "text-ink/80")}>
          {uniIcon(u.id) ? (
             
            <img src={uniIcon(u.id)!} alt="" className="size-[18px] shrink-0 rounded-[4px] bg-white object-contain p-px ring-1 ring-ink/10 transition-transform group-hover:scale-110" />
          ) : (
            <Icon name="landmark" size={14} />
          )}
          <span className="truncate">{u.name}</span>
        </Link>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="relative overflow-hidden">
            <span aria-hidden className="absolute bottom-2 left-[17px] top-1 w-px bg-border" />
            {UNI_PAGES.map((pg) => {
              const href = pg.seg ? `${base}/${pg.seg}` : base;
              return <NavRow key={pg.seg} href={href} label={pg.label} icon={pg.icon} active={pg.seg ? path.startsWith(href) : path === base} depth={1} onNavigate={onNavigate} />;
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Notion-style rail. One hover highlight glides between rows (Sidebar 2.0 technique). */
function SidebarBody({ path, pending, projects, universities, user, workspaces, activeSociety, society, university, onNavigate }: { path: string; pending: number; projects: Project[]; universities: Uni[]; user: ShellUser; workspaces: WorkspaceItem[]; activeSociety: string; society: string; university: string; onNavigate?: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);
  const track = (e: React.PointerEvent) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>("[data-nav-row]");
    if (!row || !host.current?.contains(row)) return;
    const r = row.getBoundingClientRect();
    const h = host.current.getBoundingClientRect();
    setBox({ top: r.top - h.top + host.current.scrollTop, height: r.height });
  };
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-3 pb-3 pt-4">
        { }
        <img src="/movents-logo.svg" alt="Movents" className="size-10 shrink-0 transition-transform duration-300 hover:-rotate-6 hover:scale-105" />
        <div className="min-w-0 leading-tight">
          <p className="font-display text-[15px] font-bold">Movents</p>
          <p className="truncate text-[11.5px] text-muted-foreground">{society} · {university}</p>
        </div>
      </div>

      <div ref={host} onPointerOver={track} onPointerLeave={() => setBox(null)} className="relative flex-1 overflow-y-auto px-2 pb-4 scrollbar-thin">
        <motion.div aria-hidden className="pointer-events-none absolute inset-x-2 z-0 rounded-lg bg-[#e6e1d5]" initial={false} animate={box ? { opacity: 1, top: box.top, height: box.height } : { opacity: 0 }} transition={SPRING.default} />
        <div className="space-y-0.5">
          <NavRow href="/" label="Box office" icon="layout-dashboard" active={path === "/" || path === "/events"} onNavigate={onNavigate} />
          <NavRow href="/new" label="New event" icon="ticket-plus" active={path === "/new" || path.startsWith("/runs")} onNavigate={onNavigate} />
          <NavRow href="/approvals" label="Backstage" icon="inbox" active={path.startsWith("/approvals")} badge={pending} onNavigate={onNavigate} />
          <NavRow href="/checkin" label="Door check-in" icon="scan-line" active={path.startsWith("/checkin")} onNavigate={onNavigate} />
        </div>
        <div className="mb-1 mt-5 flex items-center justify-between px-2.5">
          <span className="mono-label text-[10px] text-muted-foreground">Projects</span>
          <Link href="/new" onClick={onNavigate} className="text-xs text-muted-foreground hover:text-tomato" title="New event">+</Link>
        </div>
        <div className="space-y-0.5">
          {projects.map((p) => <ProjectNode key={p.id} p={p} path={path} onNavigate={onNavigate} />)}
        </div>
        <div className="mb-1 mt-5 flex items-center justify-between px-2.5">
          <Link href="/universities" onClick={onNavigate} className="mono-label text-[10px] text-muted-foreground hover:text-ink">Universities</Link>
          <Link href="/universities/new" onClick={onNavigate} className="text-xs text-muted-foreground hover:text-tomato" title="Add university">+</Link>
        </div>
        <div className="space-y-0.5">
          {universities.map((u) => <UniNode key={u.id} u={u} path={path} onNavigate={onNavigate} />)}
        </div>
        <div className="mb-1 mt-5 px-2.5"><span className="mono-label text-[10px] text-muted-foreground">Admin</span></div>
        <div className="space-y-0.5">
          {ADMIN.map((w) => <NavRow key={w.href} href={w.href} label={w.label} icon={w.icon} active={path.startsWith(w.href)} onNavigate={onNavigate} />)}
        </div>
      </div>
      <div className="border-t border-border p-2">
        <UserMenu user={user} workspaces={workspaces} activeSociety={activeSociety} />
      </div>
    </div>
  );
}

function UserMenu({ user, workspaces, activeSociety }: { user: ShellUser; workspaces: WorkspaceItem[]; activeSociety: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  async function switchTo(id: string) {
    const r = await switchWorkspaceAction(id);
    if (!r.ok) return toast.error(r.error);
    setOpen(false);
    router.push("/");
    router.refresh();
  }
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left transition-colors hover:bg-sand/70">
        <span className="grid size-8 shrink-0 place-items-center rounded-full border-[1.5px] border-ink bg-card text-[11px] font-bold">{initials(user.name)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold">{user.name}</span>
          <Wristband role={user.role} size="xs" className="mt-0.5" />
        </span>
        <ChevronsUpDown className="size-4 text-muted-foreground" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={SPRING.snappy}
            className="absolute bottom-full left-0 z-50 mb-2 w-72 rounded-2xl border-[1.5px] border-ink bg-card p-2 shadow-[4px_4px_0_0_#161514]"
          >
            <p className="truncate px-2 pb-2 pt-1 text-xs text-muted-foreground">{user.email}</p>
            <p className="mono-label px-2 pb-1 text-[10px] text-muted-foreground">Societies</p>
            {workspaces.map((w) => (
              <button
                key={w.society_id}
                onClick={() => w.society_id !== activeSociety && switchTo(w.society_id)}
                className="group flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-sand/60"
              >
                <span className={cn("h-7 w-1.5 rounded-full", ROLE_BAND[w.role].bg)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{w.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{ROLE_LABEL[w.role]} · {w.university}</span>
                </span>
                {w.society_id === activeSociety && <Check className="size-4 text-tomato" />}
              </button>
            ))}
            <Link href="/onboarding?new=1" className="mt-1 flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-sand/60">
              <Plus className="size-4" /> New society
            </Link>
            <div className="my-1 h-px bg-border" />
            <form action={signOut}>
              <button className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-sand/60">
                <LogOut className="size-4" /> Sign out
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Notifications({ notes }: { notes: Note[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const row = useRowIcon();
  const unread = notes.filter((n) => !n.read).length;
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} onMouseEnter={row.onMouseEnter} onMouseLeave={row.onMouseLeave} aria-label="Notifications" className="relative grid size-9 place-items-center rounded-xl hover:bg-sand/70">
        <Icon ref={row.ref} name="bell" size={18} manual />
        {unread > 0 && <span className="absolute right-1 top-1 grid size-4 place-items-center rounded-full bg-tomato text-[9px] font-bold">{unread}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={SPRING.snappy} className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-2xl border-[1.5px] border-ink bg-card shadow-[4px_4px_0_0_#161514]">
            <div className="mono-label border-b border-border px-3 py-2.5 text-[10px]">Notifications</div>
            <div className="max-h-96 overflow-y-auto scrollbar-thin">
              {notes.length === 0 && <p className="p-4 text-sm text-muted-foreground">All quiet backstage.</p>}
              {notes.map((n) => (
                <Link key={n.id} href={n.link ?? "#"} onClick={() => setOpen(false)} className="block border-b border-border/70 px-3 py-2.5 hover:bg-sand/50">
                  <p className="text-sm font-medium">{n.title}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function crumbs(path: string, projects: Project[], unis: Uni[]) {
  const items: { label: string; href?: string }[] = [{ label: "Movents", href: "/" }];
  const m = path.match(/^\/events\/([^/]+)(?:\/([^/]+))?/);
  if (m) {
    const p = projects.find((x) => x.id === m[1]);
    items.push({ label: "Projects", href: "/events" });
    items.push({ label: p?.title ?? "Project", href: `/events/${m[1]}` });
    items.push({ label: PROJECT_PAGES.find((x) => x.seg === (m[2] ?? ""))?.label ?? "Overview" });
    return items;
  }
  const u = path.match(/^\/universities\/([^/]+)(?:\/([^/]+))?/);
  if (u && u[1] !== "new") {
    items.push({ label: "Universities", href: "/universities" });
    items.push({ label: unis.find((x) => x.id === u[1])?.short_name ?? "University", href: `/universities/${u[1]}` });
    items.push({ label: UNI_PAGES.find((x) => x.seg === (u[2] ?? ""))?.label ?? "SOP library" });
    return items;
  }
  const map: Record<string, string> = { "": "Box office", new: "New event", runs: "Agent run", approvals: "Backstage", events: "Projects", checkin: "Door check-in", universities: "Universities", outbox: "Inboxes", audit: "Audit log", settings: "Settings" };
  const seg = path.split("/")[1] ?? "";
  items.push({ label: map[seg] ?? seg });
  if (path.split("/")[2] && seg === "universities") items.push({ label: "Onboard" });
  return items;
}

export function AppShell({
  user,
  workspaces,
  activeSociety,
  pendingForMe,
  notifications,
  society,
  university,
  projects,
  universities,
  children,
}: {
  user: ShellUser;
  workspaces: WorkspaceItem[];
  activeSociety: string;
  pendingForMe: number;
  notifications: Note[];
  society: string;
  university: string;
  projects: Project[];
  universities: Uni[];
  children: React.ReactNode;
}) {
  const path = usePathname();
  const [mobile, setMobile] = useState(false);
  const items = useMemo(() => crumbs(path, projects, universities), [path, projects, universities]);
  const body = { path, pending: pendingForMe, projects, universities, user, workspaces, activeSociety, society, university };
  const run = useRowIcon();
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-[268px] shrink-0 border-r border-border bg-[#f1eee6] md:block">
        <SidebarBody {...body} />
      </aside>
      <AnimatePresence>
        {mobile && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobile(false)} className="fixed inset-0 z-40 bg-ink/30 md:hidden" />
            <motion.aside initial={{ x: -290 }} animate={{ x: 0 }} exit={{ x: -290 }} transition={SPRING.soft} className="fixed inset-y-0 left-0 z-50 w-[280px] border-r-[1.5px] border-ink bg-[#f1eee6] md:hidden">
              <button onClick={() => setMobile(false)} className="absolute right-3 top-4 z-10 grid size-8 place-items-center rounded-lg hover:bg-sand"><X className="size-4" /></button>
              <SidebarBody {...body} onNavigate={() => setMobile(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/85 px-4 backdrop-blur md:px-8">
          <button onClick={() => setMobile(true)} className="grid size-9 place-items-center rounded-xl hover:bg-sand md:hidden" aria-label="Menu"><Menu className="size-5" /></button>
          <Breadcrumb items={items} className="min-w-0 [&_a]:hover:text-tomato [&_li:last-child]:font-semibold [&_li:last-child]:text-ink" />
          <div className="ml-auto flex items-center gap-1.5">
            <Wristband role={user.role} className="hidden lg:inline-flex" />
            <Notifications notes={notifications} />
            <Link href="/new" onMouseEnter={run.onMouseEnter} onMouseLeave={run.onMouseLeave} className="hidden h-9 items-center gap-1.5 rounded-xl bg-ink px-3 text-sm font-medium text-white shadow-[2px_2px_0_0_#ff5a36] transition-shadow hover:shadow-[3px_3px_0_0_#ff5a36] sm:inline-flex">
              <Icon ref={run.ref} name="sparkles" size={15} manual />
              New event
            </Link>
          </div>
        </header>
        <Bunting className="mx-4 md:mx-8" />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-4 md:px-10 md:pb-16">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t-[1.5px] border-ink bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="grid grid-cols-4">
          {[
            { href: "/", label: "Home", icon: "layout-dashboard" as IconName },
            { href: "/new", label: "New", icon: "ticket-plus" as IconName },
            { href: "/approvals", label: "Inbox", icon: "inbox" as IconName },
            { href: "/checkin", label: "Check-in", icon: "scan-line" as IconName },
          ].map((m) => {
            const active = m.href === "/" ? path === "/" : path.startsWith(m.href);
            return (
              <Link key={m.href} href={m.href} className={cn("relative flex flex-col items-center gap-0.5 py-2 text-[11px]", active ? "font-semibold text-ink" : "text-muted-foreground")}>
                {active && <motion.span layoutId="mobile-nav" className="absolute inset-x-6 top-0 h-[3px] rounded-b bg-tomato" transition={SPRING.default} />}
                <span className="relative">
                  <Icon name={m.icon} size={20} />
                  {m.href === "/approvals" && pendingForMe > 0 && <span className="absolute -right-2 -top-1 grid size-4 place-items-center rounded-full bg-tomato text-[9px] font-bold">{pendingForMe}</span>}
                </span>
                {m.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
