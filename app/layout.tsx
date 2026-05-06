import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import PwaInstallBanner from "@/components/ui/PwaInstallBanner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Auxlog",
  description: "今日のメニューを、30秒で。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",  // PWAモードでセーフエリアを有効化
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans bg-white dark:bg-black text-black dark:text-white">
        {children}
        <PwaInstallBanner />
      </body>
    </html>
  );
}
