"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "pwa_install_dismissed";
const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7日

function getSavedDismissal(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const { t } = JSON.parse(raw) as { t: number };
    return Date.now() - t < EXPIRY_MS;
  } catch {
    return false;
  }
}

function saveDismissal() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ t: Date.now() }));
  } catch {}
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator &&
      (navigator as { standalone?: boolean }).standalone === true)
  );
}

function isIOS(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent);
}

function isWebView(): boolean {
  const ua = navigator.userAgent;
  if (isAndroid()) return /\bwv\b|twitterAndroid/i.test(ua);
  if (isIOS()) {
    const isChromeIOS = /CriOS/i.test(ua);
    const isFirefoxIOS = /FxiOS/i.test(ua);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isRealSafari = typeof (window as any).safari !== "undefined";
    return !isRealSafari && !isChromeIOS && !isFirefoxIOS;
  }
  return false;
}

type DeferredPrompt = {
  prompt: () => void;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function PwaInstallBanner() {
  const [show, setShow] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<DeferredPrompt | null>(null);

  useEffect(() => {
    if (getSavedDismissal()) return;
    if (isStandalone() || isWebView()) return;

    const ios = isIOS();
    const android = isAndroid();
    if (!ios && !android) return;

    if (android) {
      const handler = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e as unknown as DeferredPrompt);
        setPlatform("android");
        setTimeout(() => setShow(true), 5000);
      };
      window.addEventListener("beforeinstallprompt", handler);
      return () => window.removeEventListener("beforeinstallprompt", handler);
    }

    if (ios) {
      setPlatform("ios");
      const timer = setTimeout(() => setShow(true), 5000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleDismiss = () => {
    saveDismissal();
    setShow(false);
  };

  const handleInstallAndroid = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setShow(false);
  };

  if (!show) return null;

  if (platform === "ios") {
    return (
      <div className="fixed bottom-20 left-4 right-4 z-50 bg-black text-white rounded-2xl shadow-2xl p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-sm mb-1">ホーム画面に追加する</p>
            <p className="text-xs text-white/60 leading-relaxed">
              画面下の共有ボタン → 「ホーム画面に追加」でいつでもすぐ開けます。
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="text-white/40 text-xl leading-none flex-shrink-0 mt-0.5"
            aria-label="閉じる"
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  if (platform === "android") {
    return (
      <div className="fixed bottom-20 left-4 right-4 z-50 bg-black text-white rounded-2xl shadow-2xl p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-sm mb-0.5">ホーム画面に追加する</p>
            <p className="text-xs text-white/60">すぐアクセスできます</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleInstallAndroid}
              className="bg-[#E8FF00] text-black font-bold px-4 py-2 rounded-full text-xs"
            >
              追加する
            </button>
            <button
              onClick={handleDismiss}
              className="text-white/40 text-xl leading-none"
              aria-label="閉じる"
            >
              ×
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
