"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { IconClose } from "./icons";

/**
 * A panel over the page: from the bottom on a phone, in the middle on a
 * wider screen. Escape, the backdrop and the close button all dismiss it,
 * and the page behind does not scroll while it is open.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => {
      document.body.style.overflow = before;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" className="pl-fade absolute inset-0 bg-[rgb(28_18_22/0.45)] backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={panel}
        tabIndex={-1}
        className="pl-sheet pl-safe-bottom relative max-h-[92vh] w-full overflow-y-auto rounded-t-[28px] bg-[var(--p-bg)] px-5 pt-3 outline-none md:max-w-[560px] md:rounded-[28px] md:pb-6"
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[var(--p-line)] md:hidden" aria-hidden />
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-[20px] font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="pl-tap grid h-9 w-9 place-items-center rounded-full bg-white ring-1 ring-[var(--p-line)]"
          >
            <IconClose size={18} />
          </button>
        </div>
        <div className="pb-4">{children}</div>
      </div>
    </div>
  );
}
