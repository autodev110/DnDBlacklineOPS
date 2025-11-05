import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DnD Backline Ops",
  description: "Internal dashboard template for DnD Backline Ops."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
