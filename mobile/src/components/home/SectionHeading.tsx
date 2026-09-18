import { Text } from "../Text";
import { GUTTER, Spacing } from "../../theme";

/**
 * A heading on the home screen.
 *
 * Its own file so the featured shelf and the occasions grid cannot drift
 * apart. It had already started to: the shelf used a small uppercase eyebrow
 * while everything around it used title2, so one section on a screen of four
 * looked like it came from a different app.
 */
export function SectionHeading({ title }: { title: string }) {
  return (
    <Text
      variant="title2"
      style={{
        paddingHorizontal: GUTTER,
        marginTop: Spacing.section,
        marginBottom: Spacing.three,
      }}
    >
      {title}
    </Text>
  );
}
