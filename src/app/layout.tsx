import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DnD Blackline Ops",
  description: "Internal dashboard template for DnD Blackline Ops."
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
