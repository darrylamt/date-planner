import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { APP_STORE_URL } from "@/lib/links";

/**
 * Where "plan a date" goes now.
 *
 * Planning happens in the app and nowhere else. The web kept a full copy of
 * the questionnaire, which meant two implementations of every question, two
 * budget sliders and two places for a change to be forgotten, and the one on
 * the web was the one nobody used.
 *
 * So this page has one job: say plainly that Duro is an iPhone app and hand
 * over the link. It does not argue, because somebody who tapped "plan a date"
 * has already agreed.
 */

export const metadata: Metadata = {
  title: "Get Duro!",
  description: "Duro plans your evening in Accra. It is an iPhone app.",
};

const STEPS = [
  {
    n: "01",
    title: "Download Duro!",
    body: "Free from the App Store, where it is listed as Duro!",
  },
  {
    n: "02",
    title: "Say what the evening is",
    body: "Who it is for, what you want to spend, and what you are in the mood for.",
  },
  {
    n: "03",
    title: "Plan your first evening",
    body: "Six questions. Real menus, real prices, and somewhere you would not have found.",
  },
];

export default function GetTheAppPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col">
      <div className="px-6 pt-[22px]">
        <Logo size={22} />
      </div>

      <div className="mt-[34px] px-6">
        <div className="text-caption font-bold uppercase tracking-[0.1em] text-flame">
          iPhone
        </div>
        <h1 className="mt-2 font-display text-hero font-bold">
          Duro lives on your <em className="not-italic text-flame">phone</em>.
        </h1>
        <p className="mt-4 text-sub text-cocoa">
          Planning happens in the app, so a plan is in your pocket on the night rather than in
          a browser tab you left open.
        </p>
      </div>

      <div className="mt-6 px-6">
        {/* noopener without noreferrer, so App Store Connect can see where installs came from. */}
        <a href={APP_STORE_URL} className="btn" target="_blank" rel="noopener">
          Get the app
        </a>
        <p className="mt-2.5 text-center text-caption text-mutedbrown">
          Free on the App Store, listed as Duro!
        </p>
      </div>

      <div className="mt-9 flex flex-col gap-5 px-6">
        {STEPS.map((s) => (
          <div key={s.n} className="flex items-start gap-4">
            <div className="w-7 shrink-0 pt-[2px]">
              <div className="font-display text-[19px] italic leading-none text-amber">{s.n}</div>
              <div className="mt-2 h-px w-6 bg-flame/50" />
            </div>
            <div>
              <div className="text-[16px] font-bold">{s.title}</div>
              <div className="mt-0.5 text-[14px] leading-normal text-mutedbrown">{s.body}</div>
            </div>
          </div>
        ))}
      </div>

      {/*
        Said rather than left to be discovered. Somebody on Android who taps
        through and finds an Apple link deserves the sentence before the tap,
        and "not yet" is the truth.
      */}
      <div className="mt-8 px-6">
        <div className="rounded-btn bg-sand p-5">
          <div className="text-[15px] font-bold">On Android?</div>
          <div className="mt-1 text-[14px] leading-normal text-mutedbrown">
            Not yet. Duro is on iPhone first. A plan somebody shares with you
            still opens in any browser, so you can be taken out in the meantime.
          </div>
        </div>
      </div>

      <div className="mt-auto px-6 pb-7 pt-8">
        <div className="kente" />
        <div className="mt-1.5 flex justify-between text-caption text-mutedbrown">
          <span>Duro · Accra first</span>
          <span className="flex gap-3">
            <Link href="/privacy" className="hover:text-flame">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-flame">
              Terms
            </Link>
          </span>
        </div>
      </div>
    </main>
  );
}
