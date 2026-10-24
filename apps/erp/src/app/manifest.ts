import type { MetadataRoute } from "next";

// Makes "Add to Home Screen" install MOGA as an app with its own name and icon.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MOGA — موجه للموبايلات",
    short_name: "MOGA",
    description: "نظام إدارة محل موجه للموبايلات والإكسسوارات",
    start_url: "/",
    display: "standalone",
    dir: "rtl",
    lang: "ar",
    background_color: "#f4f5f7",
    theme_color: "#0f766e",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
