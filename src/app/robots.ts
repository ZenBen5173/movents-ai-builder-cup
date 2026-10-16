import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/appurl";

/** Only public event pages and the legal pages are meant for search engines; the app itself is private. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/e/", "/privacy", "/terms", "/login"], disallow: "/" }],
    host: appUrl(),
  };
}
