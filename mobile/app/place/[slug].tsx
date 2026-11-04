import { Redirect, useLocalSearchParams } from "expo-router";

/** A shared Trips place link (/place/<slug>, universal link) opens the place's page. */
export default function SharedPlace() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return <Redirect href={`/trip/place/${slug}`} />;
}
