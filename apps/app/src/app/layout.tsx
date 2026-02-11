import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ORPCProvider } from "@/components/orpc-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Frost",
  description: "Vercel experience. VPS pricing.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <ORPCProvider>
          <div className="min-h-screen bg-background">{children}</div>
          <Toaster />
        </ORPCProvider>
      </body>
    </html>
  );
}
