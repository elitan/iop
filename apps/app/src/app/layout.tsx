import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { QueryProvider } from "@/components/query-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Frost",
  description: "Open source Vercel alternative",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <QueryProvider>
          <div className="min-h-screen bg-background">{children}</div>
          <Toaster />
        </QueryProvider>
      </body>
    </html>
  );
}
