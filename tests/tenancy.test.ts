import { test } from "node:test";
import assert from "node:assert/strict";

if (!process.env.DATABASE_URL) process.env.PGLITE_DIR = "memory://";
const { findOrCreateUser } = await import("../src/lib/auth/accounts");
const W = await import("../src/lib/workspace");
const { isMember, addMembers } = await import("../src/lib/members");
const { one, insert } = await import("../src/lib/db");
type U = Awaited<ReturnType<typeof findOrCreateUser>>;

const reload = (u: U) => one<U>("SELECT * FROM users WHERE id = $1", [u.id]) as Promise<U>;
const tag = Math.random().toString(36).slice(2, 8);

async function society(label: string) {
  let pres = await findOrCreateUser({ email: `${label}-${tag}@uni.test`, verified: true });
  const sid = await W.createSociety(pres, { name: `${label} society`, universityId: "uni_sunway" });
  pres = await reload(pres);
  const ev = `evt_${label}_${tag}`;
  await insert("events", { id: ev, society_id: sid, title: `${label} event`, date: "2027-03-01", created_by: pres.id });
  await addMembers(ev, [pres.id], pres.id, "lead");
  return { pres, sid, ev };
}

test("a society's events are invisible to another society, even to its President", async () => {
  const a = await society("alpha");
  const b = await society("beta");
  assert.equal(await isMember(a.pres, a.ev), true);
  assert.equal(await isMember(b.pres, a.ev), false);
  assert.equal(await isMember(a.pres, b.ev), false);
});

test("committee members only see events they were added to", async () => {
  const a = await society("gamma");
  const email = `member-${tag}@uni.test`;
  await W.inviteMember(a.pres, { email, role: "committee" });
  const inv = await one<{ id: string }>("SELECT id FROM invites WHERE email = $1", [email]);
  let m = await findOrCreateUser({ email, verified: true });
  await W.acceptInviteById(m, inv!.id);
  m = await reload(m);
  assert.equal(m.society_id, a.sid);
  assert.equal(m.role, "committee");
  assert.equal(await isMember(m, a.ev), false);
  await addMembers(a.ev, [m.id], a.pres.id);
  assert.equal(await isMember(m, a.ev), true);
});

test("an invite can only be accepted by the invited email, once", async () => {
  const a = await society("delta");
  await W.inviteMember(a.pres, { email: `right-${tag}@uni.test`, role: "director", department: "Logistics" });
  const inv = await one<{ id: string }>("SELECT id FROM invites WHERE email = $1", [`right-${tag}@uni.test`]);
  const wrong = await findOrCreateUser({ email: `wrong-${tag}@uni.test`, verified: true });
  await assert.rejects(W.acceptInviteById(wrong, inv!.id), /no longer valid/);
  const right = await findOrCreateUser({ email: `RIGHT-${tag}@uni.test`, verified: true });
  await W.acceptInviteById(right, inv!.id);
  await assert.rejects(W.acceptInviteById(right, inv!.id), /no longer valid/);
});

test("only President/VP manage members; the last President can't be demoted or removed", async () => {
  const a = await society("epsilon");
  const email = `c-${tag}@uni.test`;
  await W.inviteMember(a.pres, { email, role: "committee" });
  const inv = await one<{ id: string }>("SELECT id FROM invites WHERE email = $1", [email]);
  let c = await findOrCreateUser({ email, verified: true });
  await W.acceptInviteById(c, inv!.id);
  c = await reload(c);
  await assert.rejects(W.inviteMember(c, { email: `x-${tag}@uni.test`, role: "president" }), /Only the President or VP/);
  await assert.rejects(W.changeMemberRole(a.pres, a.pres.id, "committee", null), /at least one President/);
  await assert.rejects(W.removeFromSociety(a.pres, a.pres.id), /another President/);
  await W.removeFromSociety(a.pres, c.id);
  assert.equal((await reload(c)).society_id, null);
});

test("event membership only accepts people from the event's society", async () => {
  const a = await society("zeta");
  const b = await society("eta");
  await addMembers(a.ev, [b.pres.id], a.pres.id);
  assert.equal(await one("SELECT 1 FROM event_members WHERE event_id = $1 AND user_id = $2", [a.ev, b.pres.id]), null);
});

test("a society can be created with a new university", async () => {
  const u = await findOrCreateUser({ email: `newuni-${tag}@uni.test`, verified: true });
  const sid = await W.createSociety(u, { name: "Robotics Club", universityId: "__new", newUniversity: { name: `Test University ${tag}`, short: "TU" } });
  const row = await one<{ name: string; sop: { version: string } }>("SELECT u.name, u.sop FROM societies s JOIN universities u ON u.id = s.university_id WHERE s.id = $1", [sid]);
  assert.equal(row?.name, `Test University ${tag}`);
  assert.equal(row?.sop.version, "template");
});

test("deleting an account removes access and personal data; sole Presidents must hand over first", async () => {
  const { deleteAccount } = await import("../src/lib/auth/accounts");
  const a = await society("theta");
  await assert.rejects(deleteAccount(a.pres.id), /only President/);
  const email = `leaver-${tag}@uni.test`;
  await W.inviteMember(a.pres, { email, role: "committee" });
  const inv = await one<{ id: string }>("SELECT id FROM invites WHERE email = $1", [email]);
  const m = await findOrCreateUser({ email, verified: true });
  await W.acceptInviteById(m, inv!.id);
  await deleteAccount(m.id);
  const row = await one<{ name: string; email: string; society_id: string | null }>("SELECT name, email, society_id FROM users WHERE id = $1", [m.id]);
  assert.equal(row?.name, "Deleted user");
  assert.match(row!.email, /@invalid$/);
  assert.equal(await one("SELECT 1 FROM memberships WHERE user_id = $1", [m.id]), null);
});

test("only the society that added a university can change its rules; VPs can't make Presidents", async () => {
  const { canManageUniversity } = await import("../src/lib/universities");
  const owner = await findOrCreateUser({ email: `owner-${tag}@uni.test`, verified: true });
  const sid = await W.createSociety(owner, { name: "Owner Club", universityId: "__new", newUniversity: { name: `Owned University ${tag}`, short: "OU" } });
  const uni = (await one<{ university_id: string }>("SELECT university_id FROM societies WHERE id = $1", [sid]))!.university_id;
  const other = await findOrCreateUser({ email: `other-${tag}@uni.test`, verified: true });
  await W.createSociety(other, { name: "Other Club", universityId: uni });
  assert.equal(await canManageUniversity(await reload(owner), uni), true);
  assert.equal(await canManageUniversity(await reload(other), uni), false);
  assert.equal(await canManageUniversity(await reload(other), "uni_sunway"), false);

  const vpEmail = `vp-${tag}@uni.test`;
  const o = await reload(owner);
  await W.inviteMember(o, { email: vpEmail, role: "vp" });
  const inv = await one<{ id: string }>("SELECT id FROM invites WHERE email = $1", [vpEmail]);
  let vp = await findOrCreateUser({ email: vpEmail, verified: true });
  await W.acceptInviteById(vp, inv!.id);
  vp = await reload(vp);
  await assert.rejects(W.inviteMember(vp, { email: `sock-${tag}@uni.test`, role: "president" }), /Only a President/);
  await assert.rejects(W.changeMemberRole(vp, o.id, "committee", null), /Only a President/);
});
