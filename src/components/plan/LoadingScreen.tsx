"use client";

import { useEffect, useState } from "react";
import type { PlanInputs } from "@/lib/types";
import { possessiveName } from "@/lib/pronouns";

/** The designed generating screen: kente strip, pulsing dots, rotating messages. */
export function LoadingScreen({ inputs }: { inputs: PlanInputs }) {
  const areaLabel = inputs.surpriseMe ? "Accra" : inputs.areaNames[0] ?? "Accra";
  const messages = [
    `Checking menus in ${areaLabel}…`,
    `Balancing your GHS ${inputs.budget}…`,
    "Adding a personal touch…",
  ];
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setActive((a) => (a + 1) % messages.length), 2200);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const poss = possessiveName(inputs.partner.name, inputs.partner.pronoun);
  const hint = inputs.partner.place
    ? `Because ${inputs.partner.name || "they"} love${inputs.partner.name ? "s" : ""} ${inputs.partner.place.toLowerCase()}, we're shaping the evening around it.`
    : `We're weaving the little details you shared into every stop.`;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col items-center justify-center px-9 text-center">
      <div className="kente w-24" />
      <h1 className="mt-7 font-display text-[30px] font-bold leading-[1.3]">
        Putting {poss} evening together
      </h1>
      <div className="mt-[30px] flex items-center gap-2">
        <span className="ldot" />
        <span className="ldot" style={{ animationDelay: "0.3s" }} />
        <span className="ldot" style={{ animationDelay: "0.6s" }} />
      </div>
      <div className="mt-[34px] flex flex-col gap-3 text-[16px] text-mutedbrown">
        {messages.map((m, i) => (
          <div key={m} className={i === active ? "font-bold text-ink" : "opacity-40"}>
            {m}
          </div>
        ))}
      </div>
      <div className="why mt-11 max-w-[300px]">{hint}</div>
    </main>
  );
}
