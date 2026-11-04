import { Logo } from "@/components/Logo";
import { storeLink } from "@/lib/links";

/**
 * A place somebody shared from the app (owner, 3 Nov 2026: "users can only
 * view if they have the app"). The name, a picture and where it is, and
 * nothing more: the menu, prices, hours and the way there are in the app.
 * Open in Duro! hands the link to the app on a phone that has it; without
 * it, the App Store.
 */
export function AppOnly({
  eyebrow,
  name,
  where,
  image,
  credit,
  appPath,
}: {
  eyebrow: string;
  name: string;
  where: string | null;
  image: string | null;
  credit?: string | null;
  /** The app's own path, opened as aduro://<path>. */
  appPath: string;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col">
      <div className="px-6 pt-[22px]">
        <Logo size={22} />
      </div>

      <div className="mt-6 px-6">
        {image ? (
          <div className="overflow-hidden rounded-btn">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="" className="aspect-[4/3] w-full object-cover" />
          </div>
        ) : null}
        {credit ? <div className="mt-1 text-[11px] text-mutedbrown">{credit}</div> : null}
        <div className="mt-5 text-caption font-bold uppercase tracking-[0.1em] text-flame">{eyebrow}</div>
        <h1 className="mt-2 font-display text-hero font-bold">{name}</h1>
        {where ? <p className="mt-2 text-sub text-cocoa">{where}</p> : null}
        <p className="mt-4 text-[15px] leading-normal text-mutedbrown">
          Somebody sent you this from Duro!. The menu, prices, opening hours and how to get there are in the app.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-3 px-6">
        <a href={`aduro://${appPath}`} className="btn">
          Open in Duro!
        </a>
        {/* noopener without noreferrer, so App Store Connect can see where installs came from. */}
        <a href={storeLink("shared_place")} target="_blank" rel="noopener" className="btn2">
          Get the app
        </a>
        <p className="text-center text-caption text-mutedbrown">Free on the App Store, listed as Duro!. iPhone first.</p>
      </div>

      <div className="mt-auto px-6 pb-7 pt-10">
        <div className="kente" />
      </div>
    </main>
  );
}
