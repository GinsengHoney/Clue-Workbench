import type { Metadata } from "next";
import { DM_Sans, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const display = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const body = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "线索工作台",
  description: "材料驱动的线索整理与归纳",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`${display.variable} ${body.variable}`}>
      <body className="font-body min-h-screen antialiased">{children}</body>
    </html>
  );
}
