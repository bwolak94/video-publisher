import type { Metadata } from "next";
import "./globals.css";
import "./vf-components.css";
import { AppShell } from "@/components/layout/AppShell";

export const metadata: Metadata = {
  title: "AI Video Factory",
  description: "AI-powered video production platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <body className="bg-bg text-ink font-sans antialiased">
        <AppShell>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
