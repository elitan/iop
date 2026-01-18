import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/header";

export const metadata: Metadata = {
  title: "Frost - Deploy Docker apps. Simply.",
  description:
    "Open source Railway alternative. One server, one command. Deploy Docker apps with git push and automatic SSL.",
  icons: {
    icon: "/favicon.svg",
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
