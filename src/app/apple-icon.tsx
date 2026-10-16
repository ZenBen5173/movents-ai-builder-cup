import { ImageResponse } from "next/og";
import { LOGO_DATA_URI } from "@/lib/brand";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function Icon() {
   
  return new ImageResponse(<img src={LOGO_DATA_URI} width={180} height={180} alt="" />, size);
}
