import { Redirect, useLocalSearchParams } from "expo-router";

/** A shared venue link (/v/<id>, universal link) opens the venue's page. */
export default function SharedVenue() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={`/venue/${id}`} />;
}
