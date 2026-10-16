import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { DemoSetup } from "@/components/app/demo-setup";

export const dynamic = "force-dynamic";
export const metadata = { title: "Setting up your demo" };

export default async function DemoPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return <DemoSetup />;
}
