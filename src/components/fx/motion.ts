"use client";

import { useEffect, useState } from "react";

/*
 * Dark text on a light gradient, white on a dark one. Judged on the brighter
 * of the two stops, since a button's label crosses both: white on Outly's
 * gold was unreadable.
 */
export function inkOn(a: string, b: string): string {
  const lum = (hex: string) => {
    const n = parseInt(hex.replace("#", ""), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  return Math.max(lum(a), lum(b)) > 0.5 ? "#1A0D14" : "#FFFFFF";
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(q.matches);
    const on = () => setReduced(q.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** Two and a half seconds of paper, then the canvas removes itself. */
export function confetti(colors: string[], from: "middle" | "top" = "middle") {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:60";
  document.body.appendChild(canvas);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  const W = window.innerWidth;
  const bits = Array.from({ length: 170 }, () => ({
    x: from === "top" ? Math.random() * W : W / 2 + (Math.random() - 0.5) * 120,
    y: from === "top" ? -20 - Math.random() * 200 : window.innerHeight * 0.55,
    vx: (Math.random() - 0.5) * (from === "top" ? 4 : 16),
    vy: from === "top" ? Math.random() * 3 : -Math.random() * 17 - 7,
    w: 6 + Math.random() * 7,
    h: 8 + Math.random() * 10,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.35,
    c: colors[Math.floor(Math.random() * colors.length)],
  }));
  const start = performance.now();
  const frame = (t: number) => {
    const age = t - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const b of bits) {
      b.vy += from === "top" ? 0.12 : 0.42;
      b.vx *= 0.99;
      b.x += b.vx;
      b.y += b.vy;
      b.r += b.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - age / 2600);
      ctx.translate(b.x, b.y);
      ctx.rotate(b.r);
      ctx.fillStyle = b.c;
      ctx.fillRect(-b.w / 2, -b.h / 2, b.w, Math.abs(Math.cos(b.r)) * b.h);
      ctx.restore();
    }
    if (age < 2700) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
