import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Roomlog Tenant",
  description: "Tenant defect intake MVP for Roomlog"
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
