"use client";

/** Designed empty (no venues match) and generic error states. */

export function NoMatchScreen({
  headline,
  message,
  suggestions,
  onSuggestion,
  onStartOver,
}: {
  headline: string;
  message: string;
  suggestions: { label: string; action: "widen_area" | "raise_budget"; value?: number }[];
  onSuggestion: (s: { action: "widen_area" | "raise_budget"; value?: number }) => void;
  onStartOver: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col items-center justify-center px-9 text-center">
      <div className="kente w-[72px]" />
      <h1 className="mt-[26px] font-display text-[28px] font-bold leading-[1.3]">{headline}</h1>
      <p className="mt-3 text-[16px] leading-relaxed text-mutedbrown">{message}</p>
      <div className="mt-5 flex w-full flex-col gap-2.5">
        {suggestions.map((s) => (
          <button
            key={s.label}
            className="btn2 justify-between px-5"
            onClick={() => onSuggestion(s)}
          >
            <span>{s.label}</span>
            <span className="text-flame">→</span>
          </button>
        ))}
      </div>
      <div className="mt-[22px] text-[14px] text-mutedbrown">
        or{" "}
        <button className="font-semibold text-flame hover:text-flame-dark" onClick={onStartOver}>
          start over with different answers
        </button>
      </div>
    </main>
  );
}

export function ErrorScreen({ onRetry, message }: { onRetry: () => void; message?: string }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col items-center justify-center px-9 text-center">
      <div className="vic h-14 w-14 rounded-bar text-[24px]">✕</div>
      <h1 className="mt-6 font-display text-[28px] font-bold leading-[1.3]">That&apos;s on us.</h1>
      <p className="mt-3 text-[16px] leading-relaxed text-mutedbrown">
        {message ??
          "Something went wrong while building the plan. Your answers are safe — nothing was lost."}
      </p>
      <button className="btn mt-6 w-full" onClick={onRetry}>
        Try again
      </button>
      <div className="mt-4 text-[14px] text-mutedbrown">
        Still stuck?{" "}
        <a
          href="mailto:hello@aduro.app"
          className="font-semibold text-flame hover:text-flame-dark"
        >
          Tell us what happened
        </a>
      </div>
    </main>
  );
}
