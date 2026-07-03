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
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: "/apple-touch-icon.png"
  }
};

export const viewport: Viewport = {
  themeColor: "#2f55ff",
  viewportFit: "cover"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
