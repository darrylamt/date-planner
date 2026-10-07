"use client";

import type { ReactNode } from "react";
import { trackShare } from "@/lib/shareEvents";

/**
 * An App Store link that counts its tap (0070), for pages rendered on the
 * server. noopener without noreferrer, so App Store Connect can see where
 * installs came from.
 */
export function StoreButton({
  href,
  page,
  slug,
  className,
  children,
}: {
  href: string;
  page: "get" | "home" | "name_poll" | "split";
  /** The shared plan that sent them here, when one did. */
  slug?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a href={href} className={className} target="_blank" rel="noopener" onClick={() => trackShare("app_store", page, slug)}>
      {children}
    </a>
  );
}
