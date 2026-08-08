import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { DevUserSwitcher } from "@/components/DevUserSwitcher";

export const metadata: Metadata = {
  title: "PickleBaddies — Social Session Chaos Killer",
  description: "Run fair, low-admin social badminton & pickleball sessions.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "PickleBaddies" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#16241C",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <AuthProvider>
          {children}
          <DevUserSwitcher />
        </AuthProvider>
      </body>
    </html>
  );
}
