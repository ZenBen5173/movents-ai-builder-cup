"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Download, Folder } from "lucide-react";
import { TreeExpander, TreeIcon, TreeLabel, TreeNode, TreeNodeContent, TreeNodeTrigger, TreeProvider, TreeView } from "@/components/kibo-ui/tree";
import { cn } from "@/lib/utils";

export type FileItem = { label: string; href: string; kind: string; note?: string };
export type FolderNode = { id: string; name: string; files: FileItem[]; folders?: FolderNode[] };

const KIND: Record<string, string> = { pdf: "bg-tomato", docx: "bg-ticket-blue text-white", xlsx: "bg-[#46a758] text-white", csv: "bg-mint", ics: "bg-sun", link: "bg-sand", png: "bg-peach", mp4: "bg-peach" };

function count(f: FolderNode): number {
  return f.files.length + (f.folders ?? []).reduce((n, c) => n + count(c), 0);
}

function find(nodes: FolderNode[], id: string, trail: FolderNode[] = []): FolderNode[] | null {
  for (const n of nodes) {
    if (n.id === id) return [...trail, n];
    const hit = find(n.folders ?? [], id, [...trail, n]);
    if (hit) return hit;
  }
  return null;
}

function Node({ f, level, isLast }: { f: FolderNode; level: number; isLast: boolean }) {
  const kids = f.folders ?? [];
  return (
    <TreeNode nodeId={f.id} level={level} isLast={isLast}>
      <TreeNodeTrigger>
        <TreeExpander hasChildren={kids.length > 0} />
        <TreeIcon hasChildren />
        <TreeLabel>{f.name}</TreeLabel>
        <span className="ml-auto pl-2 font-mono text-[10px] text-muted-foreground">{count(f)}</span>
      </TreeNodeTrigger>
      {kids.length > 0 && (
        <TreeNodeContent hasChildren>
          {kids.map((c, i) => <Node key={c.id} f={c} level={level + 1} isLast={i === kids.length - 1} />)}
        </TreeNodeContent>
      )}
    </TreeNode>
  );
}

/** Folder tree on the left (library Tree View), the open folder's files on the right. */
export function FileBrowser({ tree }: { tree: FolderNode[] }) {
  const [sel, setSel] = useState<string[]>([tree[0]?.id ?? ""]);
  const trail = find(tree, sel[0] ?? "") ?? [tree[0]];
  const open = trail[trail.length - 1];
  return (
    <div className="grid gap-6 md:grid-cols-[260px_1fr]">
      <div className="rounded-xl border-[1.5px] border-ink bg-card p-1.5">
        <TreeProvider defaultExpandedIds={tree.map((t) => t.id)} showLines selectable selectedIds={sel} onSelectionChange={(ids) => ids.length && setSel(ids.slice(-1))}>
          <TreeView>
            {tree.map((f, i) => <Node key={f.id} f={f} level={0} isLast={i === tree.length - 1} />)}
          </TreeView>
        </TreeProvider>
      </div>

      <div className="min-w-0">
        <nav className="mb-3 flex flex-wrap items-center gap-1 text-sm">
          {trail.map((t, i) => (
            <span key={t.id} className="flex items-center gap-1">
              {i > 0 && <span className="text-muted-foreground">/</span>}
              <button onClick={() => setSel([t.id])} className={cn("rounded px-1 hover:bg-sand", i === trail.length - 1 ? "font-semibold" : "text-muted-foreground")}>{t.name}</button>
            </span>
          ))}
        </nav>
        <AnimatePresence mode="wait">
          <motion.ul key={open.id} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.18 }} className="border-t-[1.5px] border-ink">
            {(open.folders ?? []).map((c) => (
              <li key={c.id}>
                <button onClick={() => setSel([c.id])} className="group flex w-full items-center gap-3 border-b border-border py-2.5 text-left transition-colors hover:bg-sand/40">
                  <Folder className="size-4 text-muted-foreground transition-transform group-hover:-rotate-6" />
                  <span className="flex-1 text-sm font-medium">{c.name}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">{count(c)}</span>
                </button>
              </li>
            ))}
            {open.files.map((f, i) => (
              <motion.li key={f.href} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <a href={f.href} target="_blank" rel="noreferrer" title={f.note} className="group flex items-center gap-3 border-b border-border py-2.5 transition-colors hover:bg-sand/40">
                  <span className={cn("w-11 rounded-md border border-ink py-0.5 text-center font-mono text-[10px] font-bold uppercase", KIND[f.kind] ?? "bg-sand")}>{f.kind}</span>
                  <span className="min-w-0 flex-1 truncate text-sm transition-transform group-hover:translate-x-0.5">{f.label}</span>
                  {f.kind === "link" ? <ArrowUpRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" /> : <Download className="size-4 opacity-0 transition-opacity group-hover:opacity-100" />}
                </a>
              </motion.li>
            ))}
            {open.files.length === 0 && !(open.folders ?? []).length && <li className="py-8 text-center font-mono text-xs text-muted-foreground">Empty</li>}
          </motion.ul>
        </AnimatePresence>
      </div>
    </div>
  );
}
