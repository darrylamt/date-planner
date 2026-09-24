import Link from "next/link";
import { Logo } from "@/components/Logo";

export const metadata = {
  title: "Privacy, aduro",
  description: "What aduro collects, why, and how to get rid of it.",
};

const UPDATED = "24 September 2026";
const CONTACT = "planbyaduro@gmail.com";

/**
 * Privacy policy.
 *
 * Required: the App Store will not accept a submission without a reachable
 * privacy policy URL, and the same URL is what the app links to from Profile.
 *
 * Written to be read. A policy nobody can follow is not consent, and the list
 * below is short because the app genuinely collects very little.
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-[720px] px-6 py-12">
      <Logo size={26} href="/" />

      <h1 className="mt-8 font-display text-[30px] font-bold">Privacy</h1>
      <p className="mt-1 text-[14px] text-mutedbrown">Last updated {UPDATED}</p>

      {/*
        Rewritten 24 Sep 2026, because it had stopped being true.

        It said the answers you give while planning "stay on your device" --
        they are sent to our server and to Anthropic to write the plan. It
        listed an email and saved plans as everything an account holds, and
        left out conversations, the subscription, the profile and the photo. It
        said "no photos" beside a profile-picture upload. An inaccurate policy
        is a guideline 5.1.1(i) rejection and, more to the point, a promise
        made to people and not kept.
      */}
      <Section title="What we collect">
        <p>
          <strong>When you plan something:</strong> your answers (the occasion,
          budget, date, area, how many people, and anything you tell us about the
          person it is for, such as a name or what they like) are sent to our
          server to build the plan. If you have allowed it, they are also sent to
          Anthropic to write the plan&apos;s description. See{" "}
          <strong>Who else sees it</strong> below.
        </p>
        <p>
          <strong>If you use aduro without an account:</strong> to use the
          assistant or subscribe without registering, the app creates an
          identifier for your device. It has no email or name attached. Your
          conversations and any subscription are stored against it.
        </p>
        <p>
          <strong>If you create an account:</strong> your email address (or the
          one Apple or Google shares when you sign in with them), the name,
          birthday and profile photo you choose to add, the plans you save, and
          your conversations with the assistant.
        </p>
        <p>
          <strong>If you subscribe to aduro Pro:</strong> whether your
          subscription is active and when it renews. Payment is handled entirely
          by Apple; we never see your card.
        </p>
        <p>
          <strong>When you book, report or turn on notifications:</strong> a
          reservation request records the venue, date and party size. A report
          records what you said was wrong and the screen and app version it came
          from. Notifications need a device token so reminders reach your phone.
        </p>
        <p>
          <strong>To run the service:</strong> how many assistant messages each
          account has used this month, and how much each request to Anthropic
          cost, so we can keep the free allowance fair and the bill paid.
        </p>
      </Section>

      <Section title="What we do not collect">
        <p>
          No location tracking, no advertising identifiers, no contacts, and
          nothing from your photo library except a picture you choose for your
          profile. We do not sell anything to anyone, and we do not use your data
          for advertising.
        </p>
      </Section>

      <Section title="Who else sees it">
        <p>
          <strong>Anthropic</strong>, the company that makes the Claude AI models,
          receives what you type to the assistant and the planning answers used to
          write your plan&apos;s description. The app asks your permission before
          sending anything, and you can turn it off at any time under{" "}
          <strong>You</strong>. Anthropic processes it under its commercial terms,
          which do not permit using it to train models. Your email and account
          details are not sent.
        </p>
        <p>
          Venue facts come from Google Places. Data is stored with Supabase, and
          subscriptions are managed through Apple and RevenueCat. Nobody else.
        </p>
        <p>
          A plan you share is readable by anyone with the link. That is the point
          of a share link, so only send it to people you mean to.
        </p>
      </Section>

      <Section title="Deleting your account">
        <p>
          Open the app, go to <strong>You</strong>, and choose{" "}
          <strong>Delete account</strong>. Your account, saved plans,
          conversations and usage records are removed immediately. Reports you filed about venues stay, with your
          name detached, because a closed venue is still closed.
        </p>
        <p>
          Deleting your account does not cancel an aduro Pro subscription, because
          Apple holds it rather than us. Cancel it first in your iPhone&apos;s
          Settings, under your name, then Subscriptions.
        </p>
        <p>
          If you cannot get into the app, email{" "}
          <a href={`mailto:${CONTACT}`}>{CONTACT}</a> and we will do it for you.
        </p>
      </Section>

      <Section title="Children">
        <p>aduro is not intended for anyone under 13.</p>
      </Section>

      <Section title="Contact">
        <p>
          <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
        </p>
      </Section>

      <p className="mt-10 text-[14px]">
        <Link href="/terms" className="underline underline-offset-2">
          Terms of use
        </Link>
      </p>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-[18px] font-bold">{title}</h2>
      <div className="mt-2 space-y-3 text-[15px] leading-relaxed text-cocoa">
        {children}
      </div>
    </section>
  );
}
