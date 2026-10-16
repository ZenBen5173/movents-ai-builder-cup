"use server";

import { publicError } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { id, insert, one, query, update } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { assertMember, seesAll } from "@/lib/members";
import { audit } from "@/lib/audit";

type Res = { ok: true } | { ok: false; error: string };

async function run(fn: () => Promise<string | null | undefined | void>): Promise<Res> {
  try {
    const eventId = await fn();
    if (eventId) revalidatePath(`/events/${eventId}/day`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: publicError(err) };
  }
}

/** Signed-in user on the team of the event that owns this row. Returns the user and the event id. */
async function onRow(table: "volunteers" | "runsheet_items", rowId: string) {
  const user = await requireUser();
  const r = await one<{ event_id: string }>(`SELECT event_id FROM ${table} WHERE id = $1`, [rowId]);
  if (!r) throw new Error("Not found");
  await assertMember(user, r.event_id);
  return { user, eventId: r.event_id };
}

const clean = (s: string | undefined, max = 200) => (s === undefined ? undefined : s.replace(/\s+/g, " ").trim().slice(0, max));

// ------------------------------------------------------------------ run of show

/**
 * Edit a merged timetable block. The block is several 15 minute rows; the first
 * row carries the activity and note, the rest are "(cont.)" rows, so exports
 * that read the raw rows still collapse the same way.
 */
export async function updateRunsheetBlock(itemIds: string[], data: { activity?: string; owner?: string; notes?: string; location?: string }) {
  return run(async () => {
    if (!Array.isArray(itemIds) || !itemIds.length || itemIds.length > 200) throw new Error("Nothing to update");
    const { user, eventId } = await onRow("runsheet_items", itemIds[0]);
    const own = new Set((await query<{ id: string }>("SELECT id FROM runsheet_items WHERE event_id = $1", [eventId])).map((r) => r.id));
    if (itemIds.some((x) => !own.has(x))) throw new Error("Rows do not belong to one event");
    const activity = clean(data.activity);
    const owner = clean(data.owner, 80);
    const location = clean(data.location, 120);
    const notes = clean(data.notes, 400);
    if (activity !== undefined && !activity) throw new Error("Activity can't be empty");
    for (let i = 0; i < itemIds.length; i++) {
      const first = i === 0;
      await update("runsheet_items", itemIds[i], {
        activity: activity === undefined ? undefined : first ? activity : `${activity} (cont.)`,
        owner,
        location,
        notes: notes === undefined ? undefined : first ? notes : "",
      });
    }
    await audit(user, "runsheet.edited", { rows: itemIds.length, fields: Object.keys(data) }, { eventId });
    return eventId;
  });
}

// ------------------------------------------------------------------ crew

export async function updateCrew(volId: string, data: { name?: string; role?: string; phone?: string }) {
  return run(async () => {
    const { eventId } = await onRow("volunteers", volId);
    const name = clean(data.name, 80);
    const role = clean(data.role, 80);
    if (name !== undefined && !name) throw new Error("Name can't be empty");
    if (role !== undefined && !role) throw new Error("Role can't be empty");
    await update("volunteers", volId, { name, role, phone: clean(data.phone, 40) });
    return eventId;
  });
}

export async function addCrew(eventId: string, data: { name: string; role: string }) {
  return run(async () => {
    const user = await requireUser();
    await assertMember(user, eventId);
    const role = clean(data.role, 80);
    const name = clean(data.name, 80) || `${role || "Crew"} (to assign)`;
    if (!role) throw new Error("Give them a role");
    await insert("volunteers", { id: id("vol"), event_id: eventId, name, role, phone: null, shift: null, emergency: false });
    await audit(user, "crew.added", { name, role }, { eventId });
    return eventId;
  });
}

export async function removeCrew(volId: string) {
  return run(async () => {
    const { user, eventId } = await onRow("volunteers", volId);
    const v = await one<{ name: string; role: string }>("SELECT name, role FROM volunteers WHERE id = $1", [volId]);
    await query("DELETE FROM volunteers WHERE id = $1", [volId]);
    await audit(user, "crew.removed", { name: v?.name, role: v?.role }, { eventId });
    return eventId;
  });
}

// ------------------------------------------------------------------ emergency contacts

/** Make one team member the co-lead. Any previous co-lead goes back to member. Pass null to clear. */
export async function setCoLead(eventId: string, userId: string | null) {
  return run(async () => {
    const user = await requireUser();
    await assertMember(user, eventId);
    const lead = await one("SELECT 1 FROM event_members WHERE event_id = $1 AND user_id = $2 AND role = 'lead'", [eventId, user.id]);
    if (!lead && !seesAll(user)) throw new Error("Only the project lead can choose the co-lead");
    if (userId) {
      const m = await one<{ role: string }>("SELECT role FROM event_members WHERE event_id = $1 AND user_id = $2", [eventId, userId]);
      if (!m) throw new Error("Add them to the team first");
      if (m.role === "lead") throw new Error("Already the project lead");
    }
    await query("UPDATE event_members SET role = 'member' WHERE event_id = $1 AND role = 'colead'", [eventId]);
    if (userId) await query("UPDATE event_members SET role = 'colead' WHERE event_id = $1 AND user_id = $2", [eventId, userId]);
    await audit(user, "team.colead_set", { userId }, { eventId });
    return eventId;
  });
}
