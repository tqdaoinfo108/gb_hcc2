import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smart Government Kiosk",
  description: "Tauri powered kiosk client for public service browser automation"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
