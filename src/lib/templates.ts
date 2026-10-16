import type { Sop } from "./types";

export type TemplateKind = "pre_event" | "post_event" | "speaker_profile" | "custom";
export type TemplateSection = { key: string; title: string; hint: string };
export type SopTemplate = { key: string; kind: TemplateKind; title: string; sections: TemplateSection[] };

export const KIND_LABEL: Record<TemplateKind, string> = {
  pre_event: "Pre-event proposal",
  post_event: "Post-event report",
  speaker_profile: "Speaker profile",
  custom: "Custom",
};

export const DEFAULT_POST_EVENT: SopTemplate = {
  key: "post_event",
  kind: "post_event",
  title: "Post-event report",
  sections: [
    { key: "summary", title: "Event summary", hint: "What happened, headline numbers" },
    { key: "attendance", title: "Attendance", hint: "Registered vs attended by source" },
    { key: "budget", title: "Budget vs actual", hint: "Estimate, actual, variance per item" },
    { key: "feedback", title: "Feedback & NPS", hint: "Score, what worked, what to improve" },
    { key: "lessons", title: "Lessons learned", hint: "What to change next time" },
    { key: "claims", title: "Claims", hint: "Deadline and status" },
  ],
};

export const DEFAULT_SPEAKER: SopTemplate = {
  key: "speaker_profile",
  kind: "speaker_profile",
  title: "Speaker profile",
  sections: [
    { key: "name", title: "Full name", hint: "As it should appear on publicity" },
    { key: "role", title: "Title & organisation", hint: "" },
    { key: "bio", title: "Short bio", hint: "80 to 120 words" },
    { key: "talk", title: "Talk title", hint: "" },
    { key: "abstract", title: "Abstract", hint: "What attendees will learn" },
    { key: "contact", title: "Contact", hint: "Email and phone" },
    { key: "declaration", title: "External speaker declaration", hint: "Confirms content follows university guidelines" },
  ],
};

/** All templates for a university. The pre-event proposal is the SOP's required sections — one source of truth. */
export function templatesOf(sop: Sop): SopTemplate[] {
  const extra = (sop as Sop & { templates?: SopTemplate[] }).templates ?? [];
  const pre: SopTemplate = { key: "pre_event", kind: "pre_event", title: "Pre-event proposal", sections: sop.required_sections };
  const post = extra.find((t) => t.kind === "post_event") ?? DEFAULT_POST_EVENT;
  const speaker = extra.find((t) => t.kind === "speaker_profile") ?? DEFAULT_SPEAKER;
  return [pre, post, speaker, ...extra.filter((t) => t.kind === "custom")];
}

export function templateOf(sop: Sop, kind: TemplateKind) {
  return templatesOf(sop).find((t) => t.kind === kind)!;
}

/** "Title — hint" per line → sections. */
export function parseSections(text: string): TemplateSection[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean)
    .map((l) => {
      const [title, hint] = l.split(/\s+[—–-]\s+|:\s+/);
      return { key: title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40), title: title.trim(), hint: (hint ?? "").trim() };
    });
}
