import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Movents, campus event agent",
    short_name: "Movents",
    description: "One prompt plans your event the way your university requires it.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f5ef",
    theme_color: "#ff5a36",
    orientation: "portrait",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Door check-in", url: "/checkin" },
      { name: "Approvals", url: "/approvals" },
    ],
  };
}
