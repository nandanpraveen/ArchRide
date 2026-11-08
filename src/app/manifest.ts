import type { MetadataRoute } from "next";
export const dynamic = "force-static";
export default function manifest(): MetadataRoute.Manifest {
  const root = `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/`;
  return { id: root, name: "ArchRide", short_name: "ArchRide", description: "UGA campus trips and leave-time reminders", start_url: root, scope: root, display: "standalone", background_color: "#f7f8fa", theme_color: "#ba0c2f", icons: [192, 512].map(size => ({ src: `${root}icons/app-${size}.png`, sizes: `${size}x${size}`, type: "image/png", purpose: "any" })) };
}
