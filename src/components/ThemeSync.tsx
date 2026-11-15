"use client";

import { useEffect } from "react";

/*
 * Re-applies a pinned look (?theme=light|dark, kept for the visit) after the
 * page has loaded. The head script sets it before paint, but on pages
 * rendered per request React rebuilds <html> while loading and drops the
 * attribute. Visitors who never pin one follow their device through CSS
 * alone and never need this.
 */
export function ThemeSync() {
  useEffect(() => {
    try {
      const t = sessionStorage.getItem("duro-theme");
      if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
    } catch {
      /* storage blocked: the device decides */
    }
  }, []);
  return null;
}
