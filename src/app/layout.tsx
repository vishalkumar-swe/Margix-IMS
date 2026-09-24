import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Sidebar from "@/components/Sidebar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Margix WMS",
  description: "Premium Inventory Management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <div style={{ minHeight: "100vh", backgroundColor: "var(--background-color)", display: "flex" }}>
          <Sidebar />
          <div style={{ flex: 1, marginLeft: "260px" }}>
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
