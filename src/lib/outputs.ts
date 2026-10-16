import { appUrl } from "./appurl";

export function eventOutputs(eventId: string, hasReport: boolean) {
  const b = `/api/outputs/${eventId}`;
  const feed = `${appUrl()}${b}/timeline.ics`;
  return [
    { label: "Event proposal (SOP format)", href: `${b}/proposal.pdf`, kind: "pdf" },
    { label: "Event proposal (editable)", href: `${b}/proposal.docx`, kind: "docx" },
    { label: "Budget sheet with supplier quotes", href: `${b}/budget.xlsx`, kind: "xlsx" },
    { label: "Budget (CSV)", href: `${b}/budget.csv`, kind: "csv" },
    { label: "Risk register", href: `${b}/risks.xlsx`, kind: "xlsx" },
    { label: "Risk register & contingency plan", href: `${b}/risks.pdf`, kind: "pdf" },
    { label: "Run sheet & roster", href: `${b}/runsheet.pdf`, kind: "pdf" },
    { label: "Timeline calendar", href: `${b}/timeline.ics`, kind: "ics", note: "Import, or subscribe in Google Calendar" },
    { label: "Add timeline to Google Calendar", href: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feed.replace(/^https?:/, "webcal:"))}`, kind: "link", note: "Works once the app is on a public URL" },
    ...(hasReport
      ? [
          { label: "Post-event report", href: `${b}/report.pdf`, kind: "pdf" },
          { label: "Post-event report (editable)", href: `${b}/report.docx`, kind: "docx" },
        ]
      : []),
  ];
}
