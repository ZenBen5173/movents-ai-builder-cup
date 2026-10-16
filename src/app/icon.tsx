import { ImageResponse } from "next/og";
import { LOGO_DATA_URI } from "@/lib/brand";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
   
  return new ImageResponse(<img src={LOGO_DATA_URI} width={64} height={64} alt="" />, size);
}
