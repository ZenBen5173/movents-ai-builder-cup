"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DataTable } from "@/components/gustflow-table/DataTable";
import type { ColumnDef } from "@/components/gustflow-table/types";
import { deleteVendors, vendorUpdate } from "@/app/actions";
import { CursorCard } from "@/components/ui/cursor-card";

/** Live screenshot of the supplier's site for the hover preview. */
const shot = (url: string) => `https://image.thum.io/get/width/600/crop/900/noanimate/${url}`;

const COLUMNS: ColumnDef[] = [
  {
    key: "name",
    label: "Vendor",
    type: "text",
    sortable: true,
    filterable: true,
    editable: true,
    width: 280,
    renderCell: (value, row) => {
      const url = typeof row.url === "string" && row.url ? row.url : null;
      const name = String(value ?? "").split(" — ")[0];
      if (!url) return <span className="font-medium">{name}</span>;
      return (
        <CursorCard asChild image={shot(url)} description={String(row.snippet ?? new URL(url).hostname)}>
          <span className="cursor-default font-medium underline decoration-ink/20 decoration-dotted underline-offset-4">{name}</span>
        </CursorCard>
      );
    },
  },
  {
    key: "category",
    label: "Category",
    type: "select",
    sortable: true,
    filterable: true,
    editable: true,
    width: 150,
    options: [
      { value: "food", label: "Food" },
      { value: "tshirt", label: "T-shirts" },
      { value: "lanyard", label: "Lanyards" },
      { value: "cardholder", label: "Card holders" },
      { value: "av", label: "AV" },
      { value: "printing", label: "Printing" },
    ],
  },
  { key: "unit_price", label: "Unit price (RM)", type: "number", sortable: true, editable: true, aggregate: "avg", width: 140 },
  { key: "unit", label: "Unit", type: "text", editable: true, width: 90 },
  { key: "rating", label: "Rating", type: "number", sortable: true, editable: true, aggregate: "avg", width: 100 },
  { key: "contact_email", label: "Contact", type: "email", editable: true, width: 210 },
  { key: "url", label: "Website", type: "url", editable: true, width: 220 },
  {
    key: "contract_status",
    label: "Contract",
    type: "select",
    sortable: true,
    filterable: true,
    editable: true,
    width: 120,
    options: [
      { value: "none", label: "None" },
      { value: "quoted", label: "Quoted" },
      { value: "sent", label: "Sent" },
      { value: "signed", label: "Signed" },
    ],
  },
];

const EDITABLE = new Set(["name", "category", "unit_price", "unit", "rating", "contact_email", "url", "contract_status"]);

/** The university's approved vendor list — Notion-style database from the component library. */
export function VendorTable({ rows }: { rows: Record<string, unknown>[] }) {
  const router = useRouter();
  return (
    <DataTable
      columns={COLUMNS}
      data={rows}
      titleKey="name"
      viewId="movents-vendors"
      searchable
      paginated
      exportable="vendors"
      onEdit={async (rowId, key, value) => {
        if (!EDITABLE.has(key)) return;
        const v = key === "unit_price" || key === "rating" ? (value === "" || value == null ? null : Number(value)) : value;
        const r = await vendorUpdate(rowId, { [key]: v } as never);
        if (!r.ok) toast.error(r.error);
        router.refresh();
      }}
      bulkActions={{
        onDelete: async (ids) => {
          const r = await deleteVendors(ids);
          if (r.ok) toast.success(r.message ?? "Removed");
          else toast.error(r.error);
          router.refresh();
        },
      }}
    />
  );
}
