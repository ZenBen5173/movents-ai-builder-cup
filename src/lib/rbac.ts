import type { ActionType, ApprovalRequest, Role, User } from "./types";

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

/**
 * The permission table from the spec (section 3), as code.
 * Every outbound action calls this before it runs.
 */
export function decide(
  user: Pick<User, "role" | "department">,
  action: ActionType,
  ctx: { amount?: number; threshold?: number } = {},
): Decision {
  if (FINAL.includes(user.role)) {
    return { allowed: true, reason: `${user.role} has final authority` };
  }

  // Internal team calendar: anyone in the society can push.
  if (action === "calendar.push" && user.role !== "faculty_advisor") {
    return { allowed: true, reason: "Internal calendar is open to all society members" };
  }

  if (action === "budget.approve") {
    const threshold = ctx.threshold ?? 1000;
    const amount = ctx.amount ?? 0;
    if (amount <= threshold && user.role === "director") {
      return { allowed: true, reason: `RM${amount} is within the RM${threshold} director limit` };
    }
    return {
      allowed: false,
      approver_role: "president",
      approver_department: null,
      reason:
        amount > threshold
          ? `RM${amount} exceeds the RM${threshold} threshold, President/VP must approve`
          : "Budget approval needs a Director or the President",
    };
  }

  const dept = ACTION_DEPARTMENT[action];
  if (dept) {
    if (user.role === "director") {
      return { allowed: true, reason: `Directors may send ${ACTION_LABEL[action].toLowerCase()}s` };
    }
    return {
      allowed: false,
      approver_role: "director",
      approver_department: dept,
      reason: `Committee members cannot send outbound email, routed to the ${dept} Director`,
    };
  }

  return {
    allowed: false,
    approver_role: "president",
    approver_department: null,
    reason: `${ACTION_LABEL[action]} needs final approval from the President/VP`,
  };
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
