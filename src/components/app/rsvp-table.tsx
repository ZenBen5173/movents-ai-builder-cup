"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DataTable } from "@/components/gustflow-table/DataTable";
import type { ColumnDef } from "@/components/gustflow-table/types";
import { checkIn, setRsvpStatus } from "@/app/actions";
import type { Rsvp } from "@/lib/types";

const COLUMNS: ColumnDef[] = [
  { key: "name", label: "Name", type: "text", sortable: true, filterable: true, width: 220 },
  { key: "email", label: "Email", type: "email", filterable: true, width: 240 },
  {
    key: "status",
    label: "Status",
    type: "select",
    sortable: true,
    filterable: true,
    editable: true,
    width: 120,
    options: [
      { value: "going", label: "Going" },
      { value: "waitlist", label: "Waitlist" },
      { value: "cancelled", label: "Cancelled" },
    ],
  },
  { key: "checked_in", label: "Checked in", type: "checkbox", sortable: true, filterable: true, editable: true, aggregate: "count", width: 120 },
  { key: "source", label: "Source", type: "select", sortable: true, filterable: true, width: 110, options: [{ value: "luma", label: "Luma" }, { value: "meetup", label: "Meetup" }, { value: "direct", label: "Direct" }] },
  { key: "dietary", label: "Dietary", type: "text", filterable: true, width: 140 },
  { key: "accessibility", label: "Access", type: "text", filterable: true, width: 150 },
];

/** Attendees as a Notion-style database (library Data Table). */
export function RsvpTable({ rows }: { rows: Rsvp[]; compact?: boolean }) {
  const router = useRouter();
  return (
    <DataTable
      columns={COLUMNS}
      data={rows as unknown as Record<string, unknown>[]}
      titleKey="name"
      viewId="movents-attendees"
      searchable
      paginated
      exportable="attendees"
      onEdit={async (rowId, key, value) => {
        const r = key === "checked_in" ? await checkIn(rowId, Boolean(value)) : key === "status" ? await setRsvpStatus(rowId, String(value)) : null;
        if (r && !r.ok) toast.error(r.error);
        router.refresh();
      }}
    />
  );
}
