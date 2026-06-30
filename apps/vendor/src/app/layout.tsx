import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Roomlog Vendor",
  description: "Vendor repair workflow MVP for Roomlog"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
