import type { Metadata } from "next";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = {
  title: "Duro! support",
  description: "Get help with Duro!: plans, Durobot, Duro Pro, your account and listing your place.",
};

const SUPPORT = "support@duroplans.com";
const PARTNERS = "partners@duroplans.com";

/** The App Store's Support URL: who to write to, and answers to the questions people ask most. */
export default function SupportPage() {
  return (
    <main className="mx-auto w-full max-w-[680px] px-6 py-12">
      <Logo size={26} href="/" />
      <h1 className="mt-8 font-display text-[30px] font-bold">How can we help?</h1>
      <p className="mt-3 text-body">
        Write to{" "}
        <a className="font-semibold text-flame" href={`mailto:${SUPPORT}`}>
          {SUPPORT}
        </a>{" "}
        and a person replies, usually within a day. In the app you can also go to <strong>You → Report a problem</strong>, which
        sends us the screen and the app version with your message.
      </p>

      <section className="mt-8 space-y-5 text-body">
        <div>
          <h2 className="text-[19px] font-bold">A price is wrong, or a place has closed</h2>
          <p className="mt-1">Open the place in the app and tap Report. We check every report and fix the catalogue.</p>
        </div>
        <div>
          <h2 className="text-[19px] font-bold">Duro Pro and billing</h2>
          <p className="mt-1">
            Duro Pro is billed by Apple. To cancel, open your iPhone&apos;s Settings → your name → Subscriptions → Duro!. On a new
            phone, open Duro Pro in the app and tap Restore Purchases.
          </p>
        </div>
        <div>
          <h2 className="text-[19px] font-bold">Deleting your account</h2>
          <p className="mt-1">
            In the app: You → Delete account. Or see{" "}
            <a className="font-semibold text-flame" href="/delete-account">
              how to delete your account
            </a>
            .
          </p>
        </div>
        <div>
          <h2 className="text-[19px] font-bold">Listing your venue, stay or event</h2>
          <p className="mt-1">
            Write to{" "}
            <a className="font-semibold text-flame" href={`mailto:${PARTNERS}`}>
              {PARTNERS}
            </a>
            .
          </p>
        </div>
        <div>
          <h2 className="text-[19px] font-bold">Privacy and terms</h2>
          <p className="mt-1">
            <a className="font-semibold text-flame" href="/privacy">
              Privacy policy
            </a>{" "}
            ·{" "}
            <a className="font-semibold text-flame" href="/terms">
              Terms of use
            </a>
          </p>
        </div>
      </section>
    </main>
  );
}
