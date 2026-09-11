import Link from "next/link";
import { Logo } from "@/components/Logo";

export const metadata = {
  title: "Privacy, aduro",
  description: "What aduro collects, why, and how to get rid of it.",
};

const UPDATED = "10 September 2026";
const CONTACT = "amoateydarryl4@gmail.com";

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

      <Section title="What we collect">
        <p>
          <strong>If you never sign in:</strong> nothing that identifies you. The answers
          you give while planning stay on your device. We do not have an account for you.
        </p>
        <p>
          <strong>If you sign in:</strong> your email address, and the plans you choose to
          save.
        </p>
        <p>
          <strong>When you book or report:</strong> a reservation request records the venue,
          date and party size. A report records which venue and what you said was wrong.
        </p>
      </Section>

      <Section title="What we do not collect">
        <p>
          No location tracking, no advertising identifiers, no contacts, no photos. We do
          not sell anything to anyone, because there is nothing to sell.
        </p>
      </Section>

      <Section title="Who else sees it">
        <p>
          The preferences you type are sent to Anthropic&apos;s API, which helps produce
          your plan and does not use them to train models. Venue facts come from Google
          Places. Data is stored with Supabase. Nobody else.
        </p>
        <p>
          A plan you share is readable by anyone with the link. That is the point of a
          share link, so only send it to people you mean to.
        </p>
      </Section>

      <Section title="Deleting your account">
        <p>
          Open the app, go to <strong>You</strong>, and choose{" "}
          <strong>Delete account</strong>. Your account and saved plans are removed
          immediately. Reports you filed about venues stay, with your name detached, because
          a closed venue is still closed.
        </p>
        <p>
          If you cannot get into the app, email <a href={`mailto:${CONTACT}`}>{CONTACT}</a>{" "}
          and we will do it for you.
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-[18px] font-bold">{title}</h2>
      <div className="mt-2 space-y-3 text-[15px] leading-relaxed text-cocoa">{children}</div>
    </section>
  );
}
