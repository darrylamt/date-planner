import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";

/**
 * Where "plan a date" goes now.
 *
 * Planning happens in the app and nowhere else. The web kept a full copy of
 * the questionnaire, which meant two implementations of every question, two
 * budget sliders and two places for a change to be forgotten, and the one on
 * the web was the one nobody used.
 *
 * So this page has one job: say plainly that aduro is an iPhone app and hand
 * over the link. It does not argue, because somebody who tapped "plan a date"
 * has already agreed.
 */

const TESTFLIGHT = "https://testflight.apple.com/join/VW3ujCKf";

export const metadata: Metadata = {
  title: "Get aduro",
  description: "aduro plans your evening in Accra. It is an iPhone app.",
};

const STEPS = [
  {
    n: "01",
    title: "Install TestFlight",
    body: "Apple's app for testing apps before they reach the App Store. Free, from the App Store.",
  },
  {
    n: "02",
    title: "Open the aduro invite",
    body: "The button below. TestFlight will ask you to accept, then install aduro.",
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
          aduro lives on your <em className="not-italic text-flame">phone</em>.
        </h1>
        <p className="mt-4 text-sub text-cocoa">
          Planning happens in the app, so a plan is in your pocket on the night rather than in
          a browser tab you left open. It is free while we are in testing.
        </p>
      </div>

      <div className="mt-6 px-6">
        <a href={TESTFLIGHT} className="btn" target="_blank" rel="noreferrer">
          Get the app
        </a>
        {/*
          Said before the tap rather than after it. A TestFlight link opened on
          a phone without TestFlight installed lands on an App Store page for
          TestFlight, which reads like the wrong link rather than like a first
          step.
        */}
        <p className="mt-2.5 text-center text-caption text-mutedbrown">
          Opens in TestFlight, Apple&apos;s testing app
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
            Not yet. aduro is iPhone-only while we are testing. A plan somebody shares with you
            still opens in any browser, so you can be taken out in the meantime.
          </div>
        </div>
      </div>

      <div className="mt-auto px-6 pb-7 pt-8">
        <div className="kente" />
        <div className="mt-1.5 flex justify-between text-caption text-mutedbrown">
          <span>aduro · Accra first</span>
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
