import Link from "next/link";
import { Logo } from "@/components/Logo";

export const metadata = {
  title: "Terms, aduro",
  description: "The short version of what aduro promises and what it does not.",
};

const UPDATED = "10 September 2026";
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
