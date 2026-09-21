import Link from "next/link";
import { Logo } from "@/components/Logo";

export const metadata = {
  title: "Terms, aduro",
  description: "The short version of what aduro promises and what it does not.",
};

const UPDATED = "21 September 2026";
const CONTACT = "amoateydarryl4@gmail.com";

/** Terms of use. Linked from the App Store listing and from Profile. */
export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-[720px] px-6 py-12">
      <Logo size={26} href="/" />

      <h1 className="mt-8 font-display text-[30px] font-bold">Terms of use</h1>
      <p className="mt-1 text-[14px] text-mutedbrown">Last updated {UPDATED}</p>

      <Section title="What aduro does">
        <p>
          It plans an evening out in Accra from venues in our catalogue, and tells you what
          it should cost. It is a suggestion, not a booking.
        </p>
      </Section>

      <Section title="About the prices">
        <p>
          Prices come from menus and price lists we have recorded. Venues change them
          without telling us. Treat every total as a good estimate rather than a quote, and
          expect transport costs in particular to move.
        </p>
        <p>
          If you find a price is wrong, report it from the plan. That is how the catalogue
          stays honest.
        </p>
      </Section>

      <Section title="About the venues">
        <p>
          We only ever suggest real places, and we check them against Google for closures.
          We still get it wrong sometimes: a venue shuts on a Monday, moves, or stops doing
          the thing you went for. Ring ahead when it matters.
        </p>
      </Section>

      <Section title="Reservations">
        <p>
          Asking for a table sends a message to the venue on your behalf. The venue decides
          whether to honour it. We are not party to the booking and cannot guarantee it.
        </p>
      </Section>

      <Section title="Your account">
        <p>
          Keep your sign-in details to yourself. You can delete your account at any time
          from <strong>You</strong> in the app.
        </p>
      </Section>

      {/*
        The subscription section Apple's guideline 3.1.2 asks for.

        Its checklist is specific: the title, the length, the price, that
        payment is charged to the Apple ID at confirmation, that it renews
        unless auto-renew is turned off 24 hours before the period ends, and
        where to cancel. A terms page that a paywall links to and that never
        mentions the subscription is a fair question for a reviewer, and it was
        the reason this page was rejected before a human ever opened the app.
      */}
      <Section title="aduro Pro">
        <p>
          Planning is free and stays free. The questionnaire, the plans it builds, saving
          and sharing them cost nothing and are not part of any subscription.
        </p>
        <p>
          <strong>aduro Pro</strong> is an auto-renewable subscription that adds the
          assistant: the chat that plans with you and answers questions about the
          catalogue. It runs for <strong>one month</strong> and renews monthly.
        </p>
        <p>
          {/*
            No figure here, deliberately.

            The App Store sets the price per region and it moves -- ours changed twice
            in a week. A number typed onto this page would be wrong for most of the
            world and stale for the rest, so the paywall shows the store&apos;s own price
            in your currency before you buy, and that is the price.
          */}
          The price is shown on the paywall in your own currency before you buy. We do not
          quote it here, because the App Store sets it per region and changes it.
        </p>
        <p>
          Pro includes 150 assistant messages a month, which is a fair-use limit rather
          than a charge: nobody is billed for going over it, the assistant simply waits
          until the month turns. Free accounts get five a month on the same terms.
        </p>
      </Section>

      <Section title="Billing, renewal and cancelling">
        <p>
          Payment is charged to your Apple ID when you confirm the purchase. The
          subscription renews automatically unless auto-renew is turned off at least
          <strong> 24 hours before the end of the current period</strong>, and your account
          is charged for the renewal within the 24 hours before that period ends.
        </p>
        <p>
          You can manage the subscription or turn off auto-renew in your Apple ID settings,
          under <strong>Settings, your name, Subscriptions</strong>. There is a link
          straight to it from <strong>aduro Pro</strong> in the app.
        </p>
        <p>
          Cancelling stops the next charge. It does not refund the period you are already
          in, and Pro keeps working until that period ends.
        </p>
        <p>
          {/*
            Worth saying plainly. Deleting an account inside an app does not touch
            the subscription, which lives with Apple, and somebody who assumes it
            does will be charged again next month and be right to be annoyed.
          */}
          Refunds are handled by Apple rather than by us, through
          reportaproblem.apple.com. Deleting your aduro account does not cancel the
          subscription, because the subscription is held by Apple and not by us. Cancel it
          first, then delete the account.
        </p>
      </Section>

      <Section title="Reports and content you submit">
        <p>
          Report things you believe to be true. Reports are read by a person before anything
          in the catalogue changes.
        </p>
      </Section>

      <Section title="Liability">
        <p>
          aduro is provided as is. We are not responsible for your experience at a venue,
          for money you spend there, or for getting between places safely.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
        </p>
      </Section>

      <p className="mt-10 text-[14px]">
        <Link href="/privacy" className="underline underline-offset-2">
          Privacy
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
