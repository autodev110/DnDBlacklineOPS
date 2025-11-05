import type { Metadata } from "next";
import { Black_Ops_One, Special_Elite } from "next/font/google";
import "./globals.css";

const headingFont = Black_Ops_One({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-black-ops"
});

const bodyFont = Special_Elite({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-special-elite"
});

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
    <html lang="en" className={`${headingFont.variable} ${bodyFont.variable}`}>
      <body>{children}</body>
    </html>
  );
}
