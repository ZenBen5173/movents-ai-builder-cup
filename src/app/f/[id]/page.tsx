import { notFound } from "next/navigation";
import { isPublished } from "@/lib/public-events";
import { one } from "@/lib/db";
import { fmtDate } from "@/lib/appurl";
import type { EventRow } from "@/lib/types";
import { FeedbackForm } from "./feedback-form";
import { BrandMark } from "@/components/app/brand-mark";

export const dynamic = "force-dynamic";
export const metadata = { title: "Feedback" };

export default async function FeedbackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ev = await one<EventRow>("SELECT * FROM events WHERE id = $1", [id]);
  if (!ev || !isPublished(ev)) notFound();
  return (
    <div className="mx-auto min-h-dvh max-w-xl px-5 py-12">
          <BrandMark />
      <p className="text-sm font-medium text-primary">Feedback · {fmtDate(ev.date)}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">How was {ev.title}?</h1>
      <p className="mt-1 text-sm text-muted-foreground">Two minutes. Your answers shape the next event.</p>
      <FeedbackForm eventId={id} />
    </div>
  );
}
