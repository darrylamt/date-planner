"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "./PlannerShell";
import { IconImage } from "./icons";

/**
 * Who they are on their nights: the logo they can change here, and the name
 * and username only we can, because the name is on cards already in people's
 * saved plans.
 */
export function ProfileCard({
  name,
  username,
  phone,
  logoUrl,
}: {
  name: string;
  username: string;
  phone: string | null;
  logoUrl: string | null;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(logoUrl);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [pop, setPop] = useState(0);

  async function send(body: FormData) {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/venue/logo", { method: "POST", body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return setNote(json.error ?? "That did not work. Try again.");
      setUrl(json.url ?? null);
      setPop((n) => n + 1);
      setNote(json.url ? "Saved. New nights carry it from now on." : "Removed.");
      router.refresh();
    } catch {
      setNote("Could not reach us. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/planner/login");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="pl-card pl-up p-5">
        <div className="flex flex-col items-center text-center sm:flex-row sm:text-left">
          <div key={pop} className={pop ? "pl-pop" : ""}>
            <Avatar name={name} logoUrl={url} size={96} />
          </div>
          <div className="mt-4 sm:ml-5 sm:mt-0">
            <div className="text-[22px] font-bold">{name}</div>
            <div className="text-[14px] text-[var(--p-muted)]">Signs in as {username}</div>
          </div>
        </div>

        <div className="mt-5 rounded-2xl bg-[var(--p-sunken)] p-4">
          <div className="text-[15px] font-bold">Your logo</div>
          <p className="mt-1 text-[14px] text-[var(--p-muted)]">
            It sits beside &ldquo;Hosted by {name}&rdquo; on your nights. A square PNG or JPEG works best, up to 2 MB.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="pl-btn !min-h-[46px] !text-[15px]" disabled={busy} onClick={() => input.current?.click()}>
              <IconImage size={18} /> {busy ? "Working…" : url ? "Change logo" : "Upload a logo"}
            </button>
            {url ? (
              <button
                type="button"
                className="pl-btn-ghost !min-h-[46px] !text-[15px]"
                disabled={busy}
                onClick={() => {
                  if (!confirm("Remove your logo from your nights?")) return;
                  const body = new FormData();
                  body.append("remove", "1");
                  void send(body);
                }}
              >
                Remove
              </button>
            ) : null}
          </div>
          {note ? <p className="pl-fade mt-3 text-[14px] font-semibold">{note}</p> : null}
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              const body = new FormData();
              body.append("file", file);
              void send(body);
            }}
          />
        </div>
      </section>

      <section className="pl-card pl-up divide-y divide-[var(--p-line)]" style={{ animationDelay: "80ms" }}>
        <Row label="Name on your nights" value={name} />
        <Row label="Username" value={username} />
        <Row label="Phone we have for you" value={phone || "None yet"} />
        <div className="px-5 py-3.5 text-[13.5px] text-[var(--p-muted)]">
          To change your name or phone,{" "}
          <Link href="/planner/help" className="font-bold text-[var(--p-accent)] underline">
            send us a message
          </Link>
          .
        </div>
      </section>

      <section className="pl-up flex flex-col gap-3" style={{ animationDelay: "160ms" }}>
        <Link href="/planner?tour=1" className="pl-btn-ghost w-full">
          Replay the welcome tour
        </Link>
        <button type="button" className="pl-btn-ghost w-full !text-[#b42318]" onClick={() => void signOut()}>
          Sign out
        </button>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3.5">
      <span className="text-[14px] text-[var(--p-muted)]">{label}</span>
      <span className="truncate text-right text-[15px] font-semibold">{value}</span>
    </div>
  );
}
