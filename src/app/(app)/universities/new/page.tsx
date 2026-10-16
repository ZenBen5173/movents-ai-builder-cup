import { pageUser } from "@/lib/guard";
import { isFinal } from "@/lib/rbac";
import { PageHeader } from "@/components/app/ui";
import { OnboardWizard } from "@/components/app/onboard-wizard";

export const dynamic = "force-dynamic";

export default async function NewUniversity() {
  const user = await pageUser();
  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="Multi-university" title="Onboard a university" description="Four steps: the university, its SOP, its venues, and the first society's president and advisor." />
      {isFinal(user) ? <OnboardWizard /> : <p className="text-sm text-muted-foreground">Only a President or VP can add a university.</p>}
    </div>
  );
}
