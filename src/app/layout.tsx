import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@fontsource/jua/400.css";
import "@fontsource/gowun-dodum/400.css";
import { tokensToCss } from "@/shared/ui/tokens";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent Academy",
  description: "내가 고른 오픈모델을 내 캐릭터와 연결해 작은 학교에서 가르치는 곳",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <style dangerouslySetInnerHTML={{ __html: tokensToCss() }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
