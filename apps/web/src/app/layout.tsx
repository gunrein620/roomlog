import type { Metadata, Viewport } from "next";
import "@roomlog/ui/tokens.css";
import "./globals.css";
import { PwaRegister } from "./pwa-register";

export const metadata: Metadata = {
  applicationName: "집우집주",
  title: "집우집주",
  description: "3D 투어와 실매물 확인 중심의 부동산 탐색 서비스",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "집우집주"
  },
  formatDetection: {
    telephone: false
  },
  icons: {
    /* 우주 trim 로고 기반 아이콘 — 구 icon.svg(지붕 마크)는 목록에서 제외 */
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: "/apple-touch-icon.png"
  }
};

export const viewport: Viewport = {
  themeColor: "#20184a",
  viewportFit: "cover"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap"
          rel="stylesheet"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
      </head>
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
