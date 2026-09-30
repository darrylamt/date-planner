"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Take a suggested name out of the public poll, or put it back. Its votes stay counted. */
export function PollHideButton({ name, hidden }: { name: string; hidden: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      className={`ml-3 text-[13px] font-semibold ${hidden ? "text-flame" : "text-staletext"} hover:underline disabled:opacity-40`}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/admin/poll-hide", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, hidden: !hidden }),
        });
        setBusy(false);
        router.refresh();
      }}
    >
      {hidden ? "Show" : "Hide"}
    </button>
  );
}
