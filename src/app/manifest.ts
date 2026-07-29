import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vixel KOC Studio",
    short_name: "Vixel KOC",
    description:
      "A source-grounded workspace for creator-native KOC and UGC product video.",
    start_url: "/studio",
    display: "standalone",
    background_color: "#090a08",
    theme_color: "#c7f43d",
    categories: ["business", "productivity", "photo"],
    orientation: "any",
  };
}
