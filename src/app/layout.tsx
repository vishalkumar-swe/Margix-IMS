import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

/**
 * Absolute base for canonical/OG URLs. Read straight from the environment
 * rather than the validated server config so a static build never needs the
 * runtime secrets just to emit <head> tags.
 */
const APP_URL = process.env.APP_URL ?? "https://ims.margixindia.com";

const DESCRIPTION =
  "Ledger-based inventory management for Indian businesses — purchasing, stock, dispatch and GST billing on one ledger.";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: { default: "Margix India", template: "%s · Margix India" },
  description: DESCRIPTION,
  applicationName: "Margix India",
  keywords: ["inventory management", "stock management", "GST invoicing", "warehouse", "Tally", "India"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: "/",
    siteName: "Margix India",
    title: "Margix India — Ledger-based inventory management",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Margix India — Ledger-based inventory management",
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false, address: false, email: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0d0f" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
