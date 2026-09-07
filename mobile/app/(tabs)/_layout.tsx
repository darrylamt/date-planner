import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useTheme } from "../../src/lib/useTheme";

/**
 * The three primary destinations, on the real UIKit tab bar.
 *
 * NativeTabs rather than a hand-rolled pill: the system bar brings its own
 * blur, scroll-edge behaviour, haptics, badge slots and accessibility, and it
 * keeps up with whatever iOS does next. A custom bar has to reimplement all of
 * that and still ends up looking a version behind.
 *
 * The planner flow stays outside this group — it is a focused linear task, and
 * a persistent nav mid-questionnaire invites abandonment.
 */
export default function TabsLayout() {
  const colors = useTheme();

  return (
    <NativeTabs
      backgroundColor={colors.backgroundElement}
      tintColor={colors.accent}
      indicatorColor={colors.backgroundSelected}
      labelStyle={{
        color: colors.textSecondary,
        selected: { color: colors.accent },
      }}
      tabBarRespectsIMEInsets
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Plan</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "sparkles", selected: "sparkles" }}
          md="auto_awesome"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="saved">
        <NativeTabs.Trigger.Label>Saved</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "bookmark", selected: "bookmark.fill" }}
          md="bookmark"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>You</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "person", selected: "person.fill" }}
          md="person"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
