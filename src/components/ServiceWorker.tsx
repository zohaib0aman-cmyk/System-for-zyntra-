"use client";

import { useEffect } from "react";

/** Registers /sw.js (needed for push notifications and for installing the app). */
export function ServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((e) => console.warn("SW registration failed", e));
    }
  }, []);
  return null;
}
