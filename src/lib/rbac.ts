import { ROLE_LABEL, type ActionType, type ApprovalRequest, type Role, type User } from "./types";

/** Department in the society that owns each kind of outbound action. */
export const ACTION_DEPARTMENT: Partial<Record<ActionType, string>> = {
  "email.speaker": "Programmes",
  "email.sponsor": "Programmes",
  "email.vendor": "Logistics",
};

export const ACTION_LABEL: Record<ActionType, string> = {
  "email.speaker": "Speaker outreach email",
  "email.sponsor": "Sponsor outreach email",
  "email.vendor": "Vendor email",
  "email.faculty": "Faculty submission",
  "publish.luma": "Publish to Luma",
  "publish.meetup": "Publish to Meetup",
  "budget.approve": "Budget approval",
  "speaker.confirm": "Speaker confirmation",
  "payment.deposit": "Vendor deposit payment",
  "calendar.push": "Push to calendar",
  "publish.social": "Social media / poster publication",
};

export type Decision =
  | { allowed: true; reason: string }
  | {
      allowed: false;
      approver_role: Role;
      approver_department: string | null;
      reason: string;
    };

const FINAL: Role[] = ["president", "vp"];

/** Actions that need someone above you to sign off: money, and anything sent to the school or faculty. */
export const SIGNOFF_ACTIONS: ActionType[] = ["budget.approve", "payment.deposit", "email.faculty"];

/**
 * Who may do what without asking. Societies run on a short chain:
 * committee member → head of department → VP → President. Only money
 * (budget sign-off, deposits) and anything sent to the school or faculty
 * needs someone higher up; committees send their own speaker, sponsor and
 * supplier emails and publish their own posts. Every outbound action calls
 * this before it runs.
 */
export function decide(
  user: Pick<User, "role" | "department">,
  action: ActionType,
  ctx: { amount?: number; threshold?: number } = {},
): Decision {
  if (FINAL.includes(user.role)) {
    return { allowed: true, reason: `${ROLE_LABEL[user.role]} has final authority` };
  }
  if (user.role === "faculty_advisor") {
    return { allowed: false, approver_role: "president", approver_department: null, reason: "Faculty advisors approve proposals; the committee runs the event" };
  }

  if (action === "budget.approve" || action === "payment.deposit") {
    const threshold = ctx.threshold ?? 1000;
    const amount = ctx.amount ?? 0;
    if (user.role === "director" && amount <= threshold) {
      return { allowed: true, reason: `RM${amount} is within the RM${threshold} head-of-department limit` };
    }
    if (user.role === "committee" && amount <= threshold) {
      return { allowed: false, approver_role: "director", approver_department: user.department, reason: `Budget items go to your head of department (up to RM${threshold})` };
    }
    return {
      allowed: false,
      approver_role: "president",
      approver_department: null,
      reason: `RM${amount} is above the RM${threshold} limit, the VP or President must approve`,
    };
  }

  if (action === "email.faculty") {
    return { allowed: false, approver_role: "president", approver_department: null, reason: "Anything sent to the faculty or school needs the VP or President first" };
  }

  return { allowed: true, reason: "Committees send their own outreach and posts" };
}

/** Can this user approve or reject this request? */
export function canDecide(user: Pick<User, "role" | "department">, req: Pick<ApprovalRequest, "approver_role" | "approver_department">) {
  if (FINAL.includes(user.role)) return true;
  if (user.role === "director" && req.approver_role === "director") {
    return !req.approver_department || req.approver_department === user.department;
  }
  return false;
}

export function canManageSop(user: Pick<User, "role">) {
  return FINAL.includes(user.role);
}

export function isFinal(user: Pick<User, "role">) {
  return FINAL.includes(user.role);
}
