import type { Metadata } from "next";
import "@roomlog/ui/tokens.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "룸로그 셸 · T-DEF 임차인 하자",
  description: "룸로그 클릭투어 셸 (첫 슬라이스: 임차인 하자 T-DEF 13화면)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
