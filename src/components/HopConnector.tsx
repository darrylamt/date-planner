import { ghs } from "@/lib/format";
import type { TransportHop } from "@/lib/types";

/** Transport connector from the style tile (.hop/.hopline/.est). */
export function HopConnector({
  hop,
  recalculating = false,
  dark = false,
}: {
  hop?: TransportHop;
  recalculating?: boolean;
  dark?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5 pl-[26px] pr-2">
      <div className={`h-11 ${dark ? "hopline-dark" : "hopline"}`} />
      {recalculating ? (
        <div className="text-[14px] text-mutedbrown">recalculating hop…</div>
      ) : hop ? (
        <div className={`text-[14px] ${dark ? "text-lagoon-soft" : "text-mutedbrown"}`}>
          {dark ? (
            <>a short ride, ~{hop.mins} min</>
          ) : (
            <>
              <b className="text-cocoa">
                Bolt · {hop.from} → {hop.to} · ~{hop.mins} min
              </b>
              <br />
              {ghs(hop.cost_ghs)}
              <span className="est">estimate</span>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
