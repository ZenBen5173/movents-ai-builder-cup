import { ImageResponse } from "next/og";
import { LOGO_DATA_URI } from "@/lib/brand";

export async function GET(_: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const s = Math.min(1024, Math.max(32, Number(size) || 192));
   
  return new ImageResponse(<img src={LOGO_DATA_URI} width={s} height={s} alt="" />, { width: s, height: s });
}
