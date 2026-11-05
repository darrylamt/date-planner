import { Redirect } from "expo-router";

/** A link this version of the app does not know opens Home, never an "Unmatched route" screen. */
export default function NotFound() {
  return <Redirect href="/" />;
}
