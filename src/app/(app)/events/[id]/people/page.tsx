import { redirect } from "next/navigation";
import { canViewEvent } from "@/lib/guard";

export default async function PeopleRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await canViewEvent(id))) return null;
  redirect(`/events/${id}/speakers`);
}
