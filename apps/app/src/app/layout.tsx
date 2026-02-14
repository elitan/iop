import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ORPCProvider } from "@/components/orpc-provider";
import { Toaster } from "@/components/ui/sonner";
import { isDemoMode } from "@/lib/demo-mode";
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
  const demoMode = isDemoMode();

  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <ORPCProvider>
          <div className="min-h-screen bg-background">
            {demoMode && (
              <div className="border-b border-amber-800/50 bg-amber-900/30 px-4 py-2 text-center text-sm text-amber-300">
                Demo mode active. Instance resets hourly. Some settings and
                actions are locked.
              </div>
            )}
            {children}
          </div>
          <Toaster />
        </ORPCProvider>
      </body>
    </html>
  );
}
