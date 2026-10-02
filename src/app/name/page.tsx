import type { Metadata } from "next";
import { NamePoll } from "@/components/poll/NamePoll";
import { pollClosed } from "@/lib/namePoll";

export const metadata: Metadata = {
  title: "Aduro is now Duro!",
  description: "The vote is in. Same app, same plans, new name.",
  openGraph: {
    title: "Aduro is now Duro!",
    description: "The vote is in. Same app, same plans, new name.",
  },
};

export default function NamePollPage() {
  return <NamePoll initialClosed={pollClosed()} />;
}
