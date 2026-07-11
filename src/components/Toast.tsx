"use client";

/** Confirmation toast from the design (.toast + .tick). */
export function Toast({ message }: { message: string }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-6">
      <div className="toast animate-fadeup">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber text-[12px] font-extrabold text-lagoon">
          ✓
        </span>
        {message}
      </div>
    </div>
  );
}
