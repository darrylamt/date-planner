import { Image } from "expo-image";
import { useIsDark } from "../lib/useTheme";

/**
 * The sign-in provider logos, as they actually look.
 *
 * The Google button used to be the letter G set in the app's own typeface,
 * which is not Google's logo. A provider button wearing an approximation of
 * someone else's mark reads as a phishing page, which is the opposite of what
 * a sign-in button needs to convey.
 *
 * PNG rather than SVG because react-native-svg is not installed here, and
 * adding it would be a new native module: the JavaScript would ship over the
 * air to a binary with no such module compiled in and crash the screen on
 * open. Assets travel with an update; native code does not. Regenerate with
 * `npx tsx scripts/build-brand-marks.ts` from the repository root.
 */
const MARKS = {
  google: require("../../assets/brand/google.png"),
  appleBlack: require("../../assets/brand/apple-black.png"),
  appleWhite: require("../../assets/brand/apple-white.png"),
};

export function BrandMark({
  provider,
  size = 24,
}: {
  provider: "apple" | "google";
  size?: number;
}) {
  const isDark = useIsDark();

  /*
   * Google's mark is four colours and reads on either background, so it never
   * swaps. Apple's is one colour and would vanish into a dark button, so it
   * has a light and a dark copy rather than a runtime tint, which expo-image
   * does not apply the same way on every platform.
   */
  const source =
    provider === "google" ? MARKS.google : isDark ? MARKS.appleWhite : MARKS.appleBlack;

  return (
    <Image
      source={source}
      style={{ width: size, height: size }}
      contentFit="contain"
      // A logo should not fade in; it is chrome, not content.
      transition={0}
    />
  );
}
