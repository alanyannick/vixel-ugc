import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vixel Campaigns",
    short_name: "Vixel Campaigns",
    description:
      "A source-grounded AI Product-to-UGC Campaign Studio for creator-style ads.",
    start_url: "/studio",
    display: "standalone",
    background_color: "#090a08",
    theme_color: "#c7f43d",
    categories: ["business", "productivity", "photo"],
    orientation: "any",
  };
}
