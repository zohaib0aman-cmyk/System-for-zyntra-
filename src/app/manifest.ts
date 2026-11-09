import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Zyntra Lead ID",
    short_name: "Zyntra",
    description: "Zyntra lead tracking: pipeline, follow-ups and PDF import.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8fafc",
    theme_color: "#4f46e5",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Follow-ups", url: "/followups", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Add lead", url: "/leads/new", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
