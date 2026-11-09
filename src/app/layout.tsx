import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/plus-jakarta-sans/index.css";
import { tokensToCss } from "@/shared/ui/tokens";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent Academy",
  description: "Choose an open model, make it yours, and teach it in a small 3D classroom",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: tokensToCss() }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
