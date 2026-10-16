import Link from "next/link";
import { StageEmpty } from "@/components/ep/kit";

export default function NotFound() {
  return (
    <div className="pt-10">
      <StageEmpty title="Nothing on this stage" body="That page moved or never existed." action={<Link href="/" className="text-sm font-semibold text-tomato-ink hover:underline">Box office</Link>} />
    </div>
  );
}
