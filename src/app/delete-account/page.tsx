import type { Metadata } from "next";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = {
  title: "Delete your Duro! account",
  description: "How to delete your Duro! account and what happens to your data.",
};

const CONTACT = "planbyaduro@gmail.com";

/**
 * The page Google Play links to as the app's account-deletion page: the app's
 * name, the steps first, then what is deleted and what is kept. Matches what
 * /api/account/delete actually does (the auth user goes, and with it every row
 * keyed to it; the few rows that outlive it lose the account, see 0001-0095).
 */
export default function DeleteAccountPage() {
  return (
    <main className="mx-auto w-full max-w-[680px] px-6 py-12">
      <Logo size={26} href="/" />
      <h1 className="mt-8 font-display text-[30px] font-bold">Delete your Duro! account</h1>

      <section className="mt-6">
        <h2 className="text-[19px] font-bold">In the app (fastest)</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-6 text-body">
          <li>Open Duro! and sign in.</li>
          <li>
            Go to <strong>You</strong> (your profile).
          </li>
          <li>
            Tap <strong>Delete account</strong> and confirm.
          </li>
        </ol>
        <p className="mt-2 text-body text-mutedbrown">It happens immediately.</p>
      </section>

      <section className="mt-6">
        <h2 className="text-[19px] font-bold">Without the app</h2>
        <p className="mt-2 text-body">
          Email{" "}
          <a className="underline" href={`mailto:${CONTACT}?subject=${encodeURIComponent("Delete my Duro! account")}`}>
            {CONTACT}
          </a>{" "}
          from the address you signed up with, with the subject &ldquo;Delete my Duro! account&rdquo;. We delete it within 7
          days and reply to confirm.
        </p>
      </section>

      <section className="mt-6">
        <h2 className="text-[19px] font-bold">Cancel Duro Pro first</h2>
        <p className="mt-2 text-body">
          Deleting your account does not cancel a subscription, because Apple or Google holds it. On Android: Play Store app
          → your profile → <strong>Payments &amp; subscriptions</strong> → Subscriptions. On iPhone: Settings → your name →
          Subscriptions.
        </p>
      </section>

      <section className="mt-6">
        <h2 className="text-[19px] font-bold">What is deleted</h2>
        <ul className="mt-2 list-disc space-y-1 pl-6 text-body">
          <li>Your account: email address, name, profile photo and birthday.</li>
          <li>Your saved plans.</li>
          <li>Your conversations with Durobot and your message usage.</li>
          <li>Anything else saved to your account in Duro!.</li>
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="text-[19px] font-bold">What is kept, without your name</h2>
        <ul className="mt-2 list-disc space-y-1 pl-6 text-body">
          <li>Reports you sent about a venue or about the app: a closed venue is still closed.</li>
          <li>Table requests you sent to a venue, which the venue keeps as its own booking record.</li>
          <li>
            Anonymous activity (places kept or swapped in plans), linked only to a random id made by your phone. To remove that
            too, use <strong>You → Reset what Duro has learned</strong> before deleting your account.
          </li>
        </ul>
        <p className="mt-2 text-body text-mutedbrown">
          None of these can be traced back to you once the account is gone. The full details are in our{" "}
          <a className="underline" href="/privacy">
            privacy policy
          </a>
          .
        </p>
      </section>
    </main>
  );
}
