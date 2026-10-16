"use server";

import { publicError } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { one, query } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { assertMember } from "@/lib/members";
import { audit } from "@/lib/audit";
import { createMeetingRecord, makeTaskForAction, meetingsReady, patchMeeting, type Meeting, type MeetingInput, type MeetingPatch } from "@/lib/meetings";

type Res<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const fail = (err: unknown) => ({ ok: false as const, error: publicError(err) });
const refresh = (eventId: string) => revalidatePath(`/events/${eventId}/meetings`);

async function onMeeting(meetingId: string) {
  const user = await requireUser();
  await meetingsReady();
  const r = await one<{ event_id: string; title: string }>("SELECT event_id, title FROM meetings WHERE id = $1", [meetingId]);
  if (!r) throw new Error("Meeting not found");
  await assertMember(user, r.event_id);
  return { user, eventId: r.event_id, title: r.title };
}

export async function createMeeting(eventId: string, data: MeetingInput): Promise<Res<Meeting>> {
  try {
    const user = await requireUser();
    await assertMember(user, eventId);
    const m = await createMeetingRecord(user, eventId, data);
    refresh(eventId);
    return { ok: true, data: m };
  } catch (err) {
    return fail(err);
  }
}

/** Any edit from the detail panel: agenda, attendance, minutes (autosave), decisions, action items, time. */
export async function saveMeeting(meetingId: string, patch: MeetingPatch): Promise<Res<Meeting>> {
  try {
    const { user, eventId, title } = await onMeeting(meetingId);
    const m = await patchMeeting(meetingId, patch);
    if (patch.status) await audit(user, `meeting.${patch.status === "done" ? "done" : patch.status === "cancelled" ? "cancelled" : "reopened"}`, { meeting: title }, { eventId });
    refresh(eventId);
    return { ok: true, data: m };
  } catch (err) {
    return fail(err);
  }
}

export async function makeActionTask(meetingId: string, actionId: string): Promise<Res<{ task_id: string; meeting: Meeting }>> {
  try {
    const { user, eventId } = await onMeeting(meetingId);
    const r = await makeTaskForAction(user, meetingId, actionId);
    refresh(eventId);
    revalidatePath(`/events/${eventId}/tasks`);
    revalidatePath(`/events/${eventId}`);
    return { ok: true, data: { task_id: r.task_id, meeting: r.meeting } };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteMeeting(meetingId: string): Promise<Res> {
  try {
    const { user, eventId, title } = await onMeeting(meetingId);
    await query("DELETE FROM meetings WHERE id = $1", [meetingId]);
    await audit(user, "meeting.deleted", { meeting: title }, { eventId });
    refresh(eventId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
