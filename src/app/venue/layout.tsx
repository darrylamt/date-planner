import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

/**
 * The portal shell.
 *
 * Deliberately thin: the login page lives under this route too and must render
 * without a session, so the gate is applied per page rather than here. A
 * layout that redirected would redirect the login page to itself.
 *
 * It wears the admin theme, which is a scoped set of variables in globals.css
 * rather than a second stylesheet. That is not laziness about the brand: a
 * venue is doing data entry, and the calmest screen we have for data entry is
 * the one already built for it.
 */
export default function VenueLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin min-h-screen">
      <div className="border-b border-line bg-cream/40">
        <div className="mx-auto flex w-full max-w-[1080px] items-center gap-3 px-5 py-3">
          <Logo size={20} href={null} />
          <span className="text-[13px] font-semibold text-mutedbrown">for venues</span>
        </div>
      </div>
      {children}
    </div>
  );
}
