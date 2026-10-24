import type { Metadata, Viewport } from "next";
import { Roboto } from "next/font/google";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/app-shell";
import "./globals.css";
const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  display: "swap",
});
export const metadata: Metadata = {
  title: {
    default: "ArchRide · UGA campus transit",
    template: "%s · ArchRide",
  },
  description:
    "A student-built UGA campus transit planner. Compare a direct bus trip with walking and make a clearer plan for getting to class.",
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#a51c30",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={roboto.variable}>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
