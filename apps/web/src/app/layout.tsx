import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { DevUserSwitcher } from "@/components/DevUserSwitcher";

export const metadata: Metadata = {
  metadataBase: new URL("https://duorally.com.au"),
  applicationName: "DuoRally",
  title: {
    default: "DuoRally | Racquet Sports Rotation App",
    template: "%s | DuoRally",
  },
  description: "Create fair player rotations, manage sit-outs, run courts, and track scores for social tennis, badminton, pickleball, squash, and table tennis sessions.",
  manifest: "/manifest.webmanifest",
  icons: {
    // SVG first so the tab icon stays crisp at any density; the PNG is the
    // fallback for browsers that don't take an SVG favicon.
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/icon-192.png",
  },
  openGraph: {
    title: "DuoRally | Racquet Sports Rotation App",
    description: "Create fair player rotations, manage sit-outs, run courts, and track scores for social tennis, badminton, pickleball, squash, and table tennis sessions.",
    url: "https://duorally.com.au",
    siteName: "DuoRally",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "DuoRally | Racquet Sports Rotation App",
    description: "Create fair player rotations, manage sit-outs, run courts, and track scores for social tennis, badminton, pickleball, squash, and table tennis sessions.",
  },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "DuoRally" },
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
