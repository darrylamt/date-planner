import { ghs } from "@/lib/format";

/** Budget summary bar from the style tile (.bbar/.bfill). */
export function BudgetBar({
  estimated,
  budget,
  food,
  transport,
  compact = false,
}: {
  estimated: number;
  budget: number;
  food?: number;
  transport?: number;
  compact?: boolean;
}) {
  const buffer = Math.max(0, budget - estimated);
  const pct = Math.min(100, Math.round((estimated / budget) * 100));

  return (
    <div className="bbar">
      <div className="mb-2 flex items-center justify-between whitespace-nowrap text-[13px]">
        <span>
          Est. <b className="font-mono">{ghs(estimated)}</b> of {ghs(budget)}
        </span>
        <span className="font-bold text-amber">{ghs(buffer)} buffer</span>
      </div>
      <div className="bfill">
        <i className="bfill-i" style={{ width: `${pct}%` }} />
      </div>
      {!compact && food !== undefined && transport !== undefined && (
        <div className="mt-[7px] text-[12px] text-lagoon-soft">
          Food {ghs(food)} · Transport {ghs(transport)} · all estimates
        </div>
      )}
    </div>
  );
}
