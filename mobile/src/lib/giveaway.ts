import { Alert, Linking } from "react-native";
import { router } from "expo-router";
import { supabase } from "./supabase";
import { pushPermission, registerForPush } from "./push";
import { enterGiveaway } from "./api";

/*
 * Ticket giveaways (0117, owner 20 Nov 2026).
 *
 * An event with a giveaway has a ticket link of duroplans.com/win/e/<id>.
 * Every Tickets button in the app opens links through openTicketLink: any
 * other link opens as before; this one enters the person first, if they are
 * signed in with notifications on, and opens what the server says (the
 * winner's ticket page for one person, the normal ticket page for everyone
 * else). Anyone who cannot enter is told why once and can still go straight
 * to tickets. Off the app (the website, a shared link, an older build) the
 * same link simply forwards to the normal ticket page.
 */
const GIVEAWAY = /\/win\/e\/([0-9a-f-]{36})(?:[/?#]|$)/i;

const open = (url: string) => void Linking.openURL(url).catch(() => undefined);

export async function openTicketLink(url: string): Promise<void> {
  const eventId = url.match(GIVEAWAY)?.[1];
  if (!eventId) return open(url);

  const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
  const user = data.session?.user;
  if (!user || user.is_anonymous) {
    Alert.alert(
      "There's a free ticket on this one 🎟️",
      "One person who taps Tickets here wins a free ticket. To be in with a chance, sign in and turn on notifications: that's how we tell you who won.",
      [
        { text: "Just get tickets", onPress: () => open(url) },
        { text: "Sign in", style: "default", onPress: () => router.push("/login") },
      ],
    );
    return;
  }

  const perm = await pushPermission();
  if (!perm) return open(url); // this build or device can't do notifications
  if (!perm.granted) {
    Alert.alert(
      "Turn on notifications to enter",
      "There's a free ticket on this event, and notifications are how we tell you who won.",
      [
        { text: "Just get tickets", onPress: () => open(url) },
        perm.canAskAgain
          ? {
              text: "Turn on",
              style: "default",
              onPress: () =>
                void registerForPush().then((r) => (r === "granted" ? enter(eventId, url) : open(url))),
            }
          : { text: "Open Settings", style: "default", onPress: () => void Linking.openSettings() },
      ],
    );
    return;
  }
  return enter(eventId, url);
}

async function enter(eventId: string, url: string, retried = false): Promise<void> {
  const answer = await enterGiveaway(eventId);
  // Permission is on but this account has no saved device yet: save it once, then try again.
  if (answer.status === "notifications" && !retried) {
    if ((await registerForPush()) === "granted") return enter(eventId, url, true);
  }
  open(answer.url ?? url);
}
