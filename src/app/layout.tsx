import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "웹캠 모션게임 허브",
  description: "웹캠으로 몸을 움직여 즐기는 인터랙티브 게임 플랫폼",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
