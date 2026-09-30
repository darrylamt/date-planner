import type { Metadata } from "next";
import { NamePoll } from "@/components/poll/NamePoll";

export const metadata: Metadata = {
  title: "Help rename aduro",
  description: "Aduro is getting renamed. Try each name on and vote for your favourite.",
  openGraph: {
    title: "Help rename aduro",
    description: "Try each name on and vote for your favourite.",
  },
};

export default function NamePollPage() {
  return <NamePoll />;
}
