"use client";

import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";

type Platform = "ios-safari" | "ios-chrome" | "android" | null;

export default function AddToHomeScreenSection() {
  const [platform, setPlatform] = useState<Platform>(null);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator &&
        (navigator as { standalone?: boolean }).standalone === true);
    setStandalone(isStandalone);

    if (/iPhone|iPad|iPod/i.test(ua)) {
      setPlatform(/CriOS/i.test(ua) ? "ios-chrome" : "ios-safari");
    } else if (/Android/i.test(ua)) {
      setPlatform("android");
    }
  }, []);

  if (!platform) return null;

  if (standalone) {
    return (
      <div className="px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
          ホーム画面
        </h2>
        <div className="flex items-center gap-3">
          <Smartphone className="w-4 h-4 text-emerald-500" />
          <span className="text-sm text-emerald-500 font-medium">
            ホーム画面に追加済み
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 py-4 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900 space-y-3">
      <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
        ホーム画面に追加する
      </h2>
      <div className="flex items-start gap-3">
        <Smartphone className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0" />
        <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
          {platform === "ios-safari"
            ? "画面下の共有ボタン（↑）→「ホーム画面に追加」をタップすると、アプリとしてすぐ開けます。"
            : platform === "ios-chrome"
            ? "右上の共有ボタン（↑）→「ホーム画面に追加」をタップすると、アプリとしてすぐ開けます。"
            : "ブラウザメニュー（⋮）→「ホーム画面に追加」をタップすると、アプリとしてすぐ開けます。"}
        </p>
      </div>
    </div>
  );
}
