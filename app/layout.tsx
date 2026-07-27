import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;
  return {
    title: "AMZ Pilot · 亚马逊运营智能中枢",
    description: "通过自然语言分析、调整与自动化亚马逊广告的内部 AI 运营工作台。",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: { title: "AMZ Pilot · 亚马逊运营智能中枢", description: "让 AI 分析、执行和自动化你的亚马逊广告。", images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title: "AMZ Pilot · 亚马逊运营智能中枢", description: "让 AI 分析、执行和自动化你的亚马逊广告。", images: [image] },
  };
}
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}