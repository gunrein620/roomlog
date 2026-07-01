import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Roomlog Homes",
  description: "3D tour-ready real estate discovery shell"
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
