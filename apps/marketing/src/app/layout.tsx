import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/header";

const title = "Frost - Get your app online, for the AI coding era.";
const description =
  "Deploy in seconds. No usage fees. Open source. Self-hosted Railway/Vercel alternative.";
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
      <body className="antialiased">
        <div className="noise-overlay" />
        <Header />
        {children}
      </body>
    </html>
  );
}
