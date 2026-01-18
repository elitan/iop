import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Frost - Deploy Docker apps. Simply.",
  description:
    "Open source Railway alternative. One server, one command. Deploy Docker apps with git push and automatic SSL.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
