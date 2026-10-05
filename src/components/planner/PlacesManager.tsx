"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlaceForm } from "./PlaceForm";
import { IconArrow, IconPin, IconPlus } from "./icons";
import type { Place } from "./nights";

/**
 * The places a planner added themselves, and a way to add another.
 *
 * Most nights are at a venue Duro already lists, chosen while putting the
 * night on, so this says so first: adding a club that is already here would
 * split it in two.
 */
export function PlacesManager({
  places: initial,
  areas,
  startOpen,
}: {
  places: Place[];
  areas: { id: string; name: string }[];
  startOpen: boolean;
}) {
  const router = useRouter();
  const [places, setPlaces] = useState(initial);
  const [adding, setAdding] = useState(startOpen);
  const [justAdded, setJustAdded] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-5">
      <div className="pl-up flex gap-3 rounded-2xl bg-[var(--p-ok-soft)] px-4 py-3.5 text-[14.5px] text-[#0b4f4a]">
        <IconPin className="mt-0.5 shrink-0" />
        <span>
          Your night can be at <b>any venue already on Duro</b>. You choose it when you put the night on. Add a place here only if it is not on
          Duro yet, like a lawn, a rooftop or a studio.
        </span>
      </div>

      {places.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {places.map((p, i) => (
            <div
              key={p.id}
              className={`pl-card pl-up flex flex-col gap-3 p-4 ${justAdded === p.id ? "ring-2 ring-[var(--p-ok)]" : ""}`}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--p-accent-soft)] text-[var(--p-accent)]">
                  <IconPin />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[16px] font-bold">{p.name}</div>
                  <div className="text-[13.5px] text-[var(--p-muted)]">{p.area || "No area set"}</div>
                  {justAdded === p.id ? <div className="pl-fade text-[13px] font-bold text-[var(--p-ok)]">Added, and live now</div> : null}
                </div>
              </div>
              <Link href={`/planner/nights/new?place=${p.id}`} className="pl-btn-soft !min-h-[44px] !text-[14.5px]">
                Put a night on here <IconArrow size={17} />
              </Link>
            </div>
          ))}
        </div>
      ) : null}

      {adding ? (
        <section className="pl-card pl-up p-5">
          <h2 className="mb-4 text-[20px] font-bold">Add a place</h2>
          <PlaceForm
            areas={areas}
            known={places.map((p) => p.id)}
            onCancel={places.length ? () => setAdding(false) : undefined}
            onCreated={(p) => {
              setPlaces((cur) => [p, ...cur]);
              setJustAdded(p.id);
              setAdding(false);
              router.refresh();
            }}
          />
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="pl-tap flex items-center gap-3 rounded-2xl border-2 border-dashed border-[var(--p-line)] bg-white px-4 py-4 text-left transition-colors hover:border-[var(--p-accent)]"
        >
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--p-accent-soft)] text-[var(--p-accent)]">
            <IconPlus />
          </span>
          <span>
            <span className="block text-[15.5px] font-bold">Add a place that is not on Duro</span>
            <span className="block text-[13.5px] text-[var(--p-muted)]">It goes live straight away.</span>
          </span>
        </button>
      )}
    </div>
  );
}
