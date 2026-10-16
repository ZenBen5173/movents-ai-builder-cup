import { notFound } from "next/navigation";
import { one } from "@/lib/db";
import type { University } from "@/lib/types";
import { Eyebrow } from "@/components/ep/kit";
import { UniTabs } from "@/components/app/uni-tabs";
import { uniIcon } from "@/lib/uni-logos";

export const dynamic = "force-dynamic";

export default async function UniversityLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const uni = await one<University>("SELECT * FROM universities WHERE id = $1", [id]);
  if (!uni) notFound();
  return (
    <div>
      <Eyebrow>University</Eyebrow>
      <div className="mt-2 flex items-center gap-4">
        {uniIcon(uni.id) && (
          <span className="grid size-14 shrink-0 place-items-center rounded-xl border-[1.5px] border-ink bg-white p-1.5 shadow-[2px_2px_0_0_#161514]">
            { }
            <img src={uniIcon(uni.id)!} alt="" className="size-full object-contain" />
          </span>
        )}
        <h1 className="font-display text-3xl font-bold tracking-tight md:text-[40px]">{uni.name}</h1>
      </div>
      <div className="mt-6"><UniTabs id={id} /></div>
      <div className="mt-8">{children}</div>
    </div>
  );
}
