"use client";

import { useEffect } from "react";
import { confetti } from "@/components/fx/motion";

/** A burst of paper in the brand colours when Pro turns on; nothing for anyone who asked for less motion. */
export function Celebrate() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => confetti(["#E11D48", "#FFB547", "#8B5CF6", "#FFFFFF"], "top"), 250);
    return () => clearTimeout(t);
  }, []);
  return null;
}
