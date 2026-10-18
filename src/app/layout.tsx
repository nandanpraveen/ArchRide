import type { Metadata, Viewport } from "next";
import { Roboto } from "next/font/google";
import { Providers } from "@/components/providers";
import { AppMenuUI } from "@/components/app-menu-ui";
import "./globals.css";
import { getUser } from "./get-user";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  let isGuest = false;

  if (!user) {
    const cookieStore = await cookies();
    if (cookieStore.has("guest")) {
      isGuest = cookieStore.get("guest")?.value === "1";
    }
  }

  return (
    <html lang="en" className={roboto.variable}>
      <body>
        <Providers>
          <AppMenuUI signedIn={user !== null || isGuest}>{children}</AppMenuUI>
        </Providers>
      </body>
    </html>
  );
}
