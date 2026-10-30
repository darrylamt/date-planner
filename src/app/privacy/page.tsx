import Link from "next/link";
import { Logo } from "@/components/Logo";

// Rebuilt hourly, so a seasonal logo (see Logo) arrives and leaves on its dates.
export const revalidate = 3600;

export const metadata = {
  title: "Privacy, Duro",
  description: "What Duro collects, why, and how to get rid of it.",
};

const UPDATED = "30 October 2026";
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
          budget, date, area, how many people, what you do not eat, and anything
          you tell us about the person it is for, such as a name or what they
          like) are sent to our
          server to build the plan. If you have allowed it, they are also sent to
          Anthropic to write the plan&apos;s description. See{" "}
          <strong>Who else sees it</strong> below.
        </p>
        <p>
          <strong>If you use Duro without an account:</strong> to use the
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
          <strong>If you subscribe to Duro Pro:</strong> whether your
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
          <strong>If you turn on Weekend ideas:</strong> to decide whether to
          send you what is on this weekend, what is new, or a nudge when it has
          been a while, we look at when you last saved a plan, what kind of plan
          you usually make, and whether you have one coming up. They are off
          until you turn them on, and you can turn them off in the app&apos;s
          profile at any time. Reminders about a plan you saved are sent either
          way.
        </p>
        <p>
          <strong>When something goes wrong in the app:</strong> the error, the
          screen it happened on, your app version and phone type, and your
          device identifier are sent to us, so we can fix it. Nothing you typed
          is included.
        </p>
        <p>
          <strong>When you ask for directions from where you are, or for
          somewhere near you:</strong> the app asks permission, then reads your
          phone&apos;s location once, while the app is open, at the moment you
          ask (a tap, or shaking your phone on the Where next screen), and
          sends it to our server to find the trotro stops and taxi routes, or
          the places, near you. It is used for that one answer and not
          stored. If you open Yango from a plan, the start point is passed to
          Yango. Duro never reads your location in the background.
        </p>
        <p>
          <strong>When you talk to Durobot instead of typing:</strong> the app
          asks for the microphone and speech recognition, and listens only
          while you hold the mic button. Apple&apos;s speech recognition turns
          what you say into text, on your phone or on Apple&apos;s servers. Duro
          never receives or keeps the recording, only the words, which go
          wherever a typed message would.
        </p>
        <p>
          <strong>To decide where to add venues, and to improve plans:</strong> a
          record of each plan request: the area chosen (or, for &ldquo;near
          me&rdquo;, a square about a kilometre across, never your exact
          position), the occasion, party size, a budget range, the day, what you
          do not eat, whether you changed the starting budget, whether we found a
          plan, its total, and the dishes and drinks it ordered at each stop. It
          carries your app version and phone type, and a code made one way from
          your device identifier or account, so we can tell a returning planner
          from a new one without the record saying who you are. Venues see only
          totals from it, never anything about a person.
        </p>
        <p>
          <strong>To see how the app is used:</strong> the days you open the app,
          which questions of a plan you reach, what you search for under Venues
          and which places you open from there, your answer when the app asks
          whether you went on a plan, and how you heard about Duro if you tell
          us. Each carries your device identifier, phone type and app version,
          and your account when you are signed in.
        </p>
        <p>
          <strong>To suggest better places:</strong> which places in your plans
          you keep, swap out, save, share or open, which dishes you add or take
          off an order, and how long you spend on a venue&apos;s page, with your
          device identifier and, when you are signed in, your account. Duro
          learns from this which places people are glad to be sent to, and your
          own plans lean towards places and dishes like the ones you keep.
          Venues see only totals, never anything about a person. To make Duro
          forget all of it, use Reset what Duro has learned in the app&apos;s
          profile.
        </p>
        <p>
          <strong>When you recommend a dish:</strong> that your account
          recommends it. Other people see only the total number of
          recommendations, never who made them.
        </p>
        <p>
          <strong>To run the service:</strong> how many assistant messages each
          account has used this month, and how much each request to Anthropic
          cost, so we can keep the free allowance fair and the bill paid.
        </p>
      </Section>

      <Section title="What we do not collect">
        <p>
          No location tracking or location history, no advertising identifiers, no contacts, and
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
          Venue facts come from Google Places. Data is stored with Supabase,
          subscriptions are managed through Apple and RevenueCat, and speaking
          to Durobot is turned into text by Apple. Nobody else.
        </p>
        <p>
          A plan you share is readable by anyone with the link. That is the point
          of a share link, so only send it to people you mean to.
        </p>
        <p>
          When somebody opens a shared plan, we count it, and whether they then
          tap to get the app, so we can tell whether sharing brings people in.
          The count holds which plan and its occasion, and nothing about the
          person: no account, no address, and nothing stored on their device.
        </p>
      </Section>

      <Section title="Deleting your account">
        <p>
          Open the app, go to <strong>You</strong>, and choose{" "}
          <strong>Delete account</strong>. Your account, saved plans,
          conversations, message counts and notification settings are removed
          immediately. Records of how the app was used stay only against your
          phone&apos;s random device identifier, no longer linked to you, and
          reinstalling the app gives the phone a new one. Reports you filed
          about venues stay, with your name detached, because a closed venue is
          still closed.
        </p>
        <p>
          Deleting your account does not cancel a Duro Pro subscription, because
          Apple or Google holds it rather than us. Cancel it first: on an iPhone,
          in Settings, under your name, then Subscriptions; on Android, in the
          Play Store app, under your profile, then Payments &amp; subscriptions.
        </p>
        <p>
          If you cannot get into the app, email{" "}
          <a href={`mailto:${CONTACT}`}>{CONTACT}</a> and we will do it for you.
        </p>
      </Section>

      {/*
        Added 3 Oct 2026, with Duro! on sale in the EU and the UK. The GDPR
        wants a policy to say who is responsible, on what basis each kind of
        data is used, how long it is kept, where it goes, and what people can
        ask for. Everything here repeats facts stated above; it adds the
        legal frame, not new practice.
      */}
      <Section title="If you are in the EU, the UK or Ghana">
        <p>
          <strong>Who is responsible.</strong> Duro is run by Darryl Amoatey,
          an individual in Accra, Ghana, who is the controller of the personal
          data described above. Reach us at{" "}
          <a href={`mailto:${CONTACT}`}>{CONTACT}</a> for anything on this page.
        </p>
        <p>
          <strong>Why we may use it.</strong> Your account, saved plans,
          conversations and subscription: to provide the service you asked for
          (contract). Sending your words to Anthropic for the assistant and
          plan descriptions: your consent, which you can withdraw under{" "}
          <strong>You</strong> at any time. The anonymous record of plan
          requests, counts of shared plans, and message and cost counts: our
          legitimate interest in running Duro fairly and deciding where to add
          venues, using data that does not say who you are. Records of how the
          app is used and error reports: our legitimate interest in making the
          app work and better. Weekend ideas: your consent, given and withdrawn
          with the switch in the app.
        </p>
        <p>
          <strong>How long we keep it.</strong> Account data, plans and
          conversations until you delete your account, when they are removed
          straight away. Location is not stored at all. The request records and
          share counts are kept, because they do not say who anyone is. Records
          of how the app is used and error reports are kept against the random
          device identifier. Reports about venues are kept with your name
          detached.
        </p>
        <p>
          <strong>Where it goes.</strong> The services named under{" "}
          <strong>Who else sees it</strong> may process data outside your
          country, including in the United States. Where they do, they rely on
          the safeguards data-protection law provides for that, such as the
          European Commission&apos;s standard contractual clauses.
        </p>
        <p>
          <strong>Your rights.</strong> You can ask for a copy of your data, to
          correct it, to delete it, to restrict or object to how it is used, and
          to have it in a form you can take elsewhere. Most of this you can do
          in the app; for the rest, email us and we will answer within a month.
          You can also complain to the data protection authority where you live,
          or in Ghana to the Data Protection Commission.
        </p>
      </Section>

      <Section title="Children">
        <p>Duro is not intended for anyone under 13.</p>
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
