import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Auxlog - 今日のメニューを、30秒で。",
    short_name: "Auxlog",
    description: "筋トレ中級者・上級者向けの科学的アルゴリズムによる自動メニュー提案アプリ",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#000000",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
