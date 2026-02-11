import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { Header } from "@/components/header";

const title = "Frost - Vercel experience. VPS pricing.";
const description = "Vercel experience. VPS pricing.";
const url = "https://frost.build";

export const metadata: Metadata = {
  title,
  description,
  icons: {
    icon: "/favicon.svg",
  },
  metadataBase: new URL(url),
  openGraph: {
    title,
    description,
    url,
    siteName: "Frost",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <Script
          defer
          data-domain="frost.build"
          src="https://analytics.j4labs.se/js/script.js"
        />
      </head>
      <body className="antialiased">
        <div className="noise-overlay" />
        <Header />
        {children}
      </body>
    </html>
  );
}
