import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { DevUserSwitcher } from "@/components/DevUserSwitcher";

export const metadata: Metadata = {
  title: "Duorally — Social Session Chaos Killer",
  description: "Run fair, low-admin social badminton & pickleball sessions.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Duorally" },
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
        {/* Brand fonts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@800&family=IBM+Plex+Mono:wght@400;500&display=swap"
        />
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
