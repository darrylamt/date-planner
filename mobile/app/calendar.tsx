import { Redirect } from "expo-router";

/** Calendar is a view inside Plans now; an old link to it lands there. */
export default function CalendarRedirect() {
  return <Redirect href="/saved?view=calendar" />;
}
