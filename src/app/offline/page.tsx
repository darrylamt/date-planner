import Link from "next/link";
import { Logo } from "@/components/Logo";

// Fully static — precached by the service worker and shown when a navigation fails offline.
export const dynamic = "force-static";

export const metadata = {
  title: "Offline · aduro",
};

export default function OfflinePage() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-cream px-6 text-center">
      <Logo size={30} href={null} />
      <div className="max-w-sm space-y-2">
        <h1 className="font-display text-2xl font-bold text-ink">You&apos;re offline</h1>
        <p className="text-sm leading-relaxed text-cocoa">
          aduro needs a connection to plan and save your evening. Reconnect and try again —
          anything already loaded is still here.
        </p>
      </div>
      <Link
        href="/"
        className="rounded-full bg-flame px-6 py-3 text-sm font-semibold text-blush transition-colors hover:bg-flame-deep"
      >
        Try again
      </Link>
    </main>
  );
}
