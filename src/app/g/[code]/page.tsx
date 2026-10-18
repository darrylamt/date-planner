import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { loadGroup, publicView } from "@/lib/groupServer";
import { storeLink } from "@/lib/links";
import { GroupClient } from "./GroupClient";

/**
 * A group outing invite, answered in the browser.
 *
 * The page anyone gets from the WhatsApp link. It must work completely
 * without the app: a friend who never installs Duro answers here, keeps an
 * edit token in this browser, and sees their own order here once the plan is
 * locked. The app is offered, never required.
 */
export const dynamic = "force-dynamic";

const OCCASION_WORD: Record<string, string> = {
  friend_outing: "a night out",
  birthday: "a birthday",
  celebration: "a celebration",
  graduation: "a graduation",
};

export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const db = createServiceClient();
  const group = await loadGroup(db, params.code);
  if (!group || group.status === "cancelled") return { title: "Duro!", robots: { index: false } };
  const view = await publicView(db, group);
  const what = view.title || OCCASION_WORD[view.occasion] || "an outing";
  return {
    title: `${view.organiser} is planning ${what} on Duro!`,
    description: "Say when you're free and what you're into. Your budget stays private.",
    robots: { index: false, follow: false },
  };
}

export default async function GroupPage({ params }: { params: { code: string } }) {
  const db = createServiceClient();
  const group = await loadGroup(db, params.code);
  if (!group || group.status === "cancelled") notFound();
  const view = await publicView(db, group);
  return <GroupClient initial={view} appStore={storeLink("group_invite")} />;
}
