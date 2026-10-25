"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ImageField, ImageListField } from "./ImageField";

type Photos = { image_url: string; gallery_urls: string[]; aesthetics: number | null };

const LOOKS = [
  [1, "Plain"],
  [2, "Ordinary"],
  [3, "Nice"],
  [4, "Beautiful"],
  [5, "Stunning"],
] as const;

/**
 * A venue's pictures, and only those. Saves image_url, gallery_urls and
 * aesthetics; the database keeps every other column as it was for a photos
 * login (0095), so this form sends nothing else.
 */
export function VenuePhotos({ venueId, initial }: { venueId: string; initial: Photos }) {
  const router = useRouter();
  const [p, setP] = useState<Photos>(initial);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const changed = JSON.stringify(p) !== JSON.stringify(initial);

  async function save() {
    setBusy(true);
    setNote(null);
    const { error } = await createClient()
      .from("venues")
      .update({
        image_url: p.image_url.trim() || null,
        gallery_urls: p.gallery_urls.map((u) => u.trim()).filter(Boolean),
        aesthetics: p.aesthetics,
      })
      .eq("id", venueId);
    setBusy(false);
    if (error) {
      setNote(`That didn't save: ${error.message}`);
      return;
    }
    setNote("Saved.");
    router.refresh();
  }

  return (
    <div className="mt-5 grid gap-5">
      <div className="card p-5">
        <ImageField
          label="Cover picture"
          value={p.image_url}
          onChange={(image_url) => setP({ ...p, image_url })}
          folder="venues"
          hint="The one that leads the card: the place itself, in daylight if you can"
        />
      </div>
      <div className="card p-5">
        <ImageListField
          label="More pictures"
          values={p.gallery_urls}
          onChange={(gallery_urls) => setP({ ...p, gallery_urls })}
          folder="venues"
          hint="Swipeable on the stop card, in this order. Inside, the food, the view."
        />
      </div>
      <div className="card p-5">
        <div className="flbl">How the place looks</div>
        <p className="mb-3 text-[13px] text-mutedbrown">From the pictures: plans for special nights lean towards the beautiful ones.</p>
        <div className="flex flex-wrap gap-2">
          {LOOKS.map(([n, label]) => (
            <button
              key={n}
              type="button"
              className={p.aesthetics === n ? "btn btnsm" : "btn2 btnsm"}
              onClick={() => setP({ ...p, aesthetics: p.aesthetics === n ? null : n })}
            >
              {n} · {label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" className="btn" onClick={save} disabled={busy || !changed}>
          {busy ? "Saving…" : "Save photos"}
        </button>
        {note ? <span className="text-[14px] text-mutedbrown">{note}</span> : null}
      </div>
    </div>
  );
}
