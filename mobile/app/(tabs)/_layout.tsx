import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { Redirect } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useQuickActionRouting } from "expo-quick-actions/router";
import { startNewPlan } from "../../src/lib/startPlan";
import { hasOnboarded } from "../../src/lib/onboarding";
import { useTheme } from "../../src/lib/useTheme";

/*
 * iOS 26 puts a tab with the search role in its own circle of glass at the
 * end of the bar, which is exactly where New plan belongs. Before 26 that
 * role would label it "Search", so there it is an ordinary last tab.
 */
const OWN_CIRCLE = Platform.OS === "ios" && parseInt(String(Platform.Version), 10) >= 26;

/**
 * Four destinations in the system's own tab bar, which on iOS 26 is Apple's
 * Liquid Glass with Apple's own motion, and on earlier versions the standard
 * bar. Drawing a lookalike over a glass view never moved like the real one.
 *
 * New plan sits beside them as its own circle. It starts a task rather than
 * switching destination, so it never becomes the selected tab: the native
 * tap is refused and the press opens the planner instead.
 *
 * The planner flow itself stays outside this group: it is a focused linear
 * task, and a persistent nav mid-questionnaire invites abandonment.
 */
export default function TabsLayout() {
  /*
   * Long-press the icon: New plan, Where next?, Ask Duro!, Your plans (app.json,
   * expo-quick-actions). Each carries the screen to open; this opens it. Here
   * and not in the root layout, which navigates before the tabs exist. On a
   * build without the module it does nothing.
   */
  useQuickActionRouting();
  const c = useTheme();
  // undefined while the flag is being read, rendering the tabs first and
  // redirecting after would flash the home screen behind the intro.
  const [onboarded, setOnboarded] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let active = true;
    void hasOnboarded().then((v) => active && setOnboarded(v));
    return () => {
      active = false;
    };
  }, []);

  if (onboarded === undefined) return null;
  if (!onboarded) return <Redirect href="/onboarding" />;

  return (
    <NativeTabs tintColor={c.accent}>
      {/* Home lets iOS inset its scroll view; the others pad for the status bar themselves. */}
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: "house", selected: "house.fill" }} />
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      {/* Second, beside Home: finding a place is the thing people do between plans. */}
      <NativeTabs.Trigger name="venues" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Icon sf={{ default: "map", selected: "map.fill" }} />
        <NativeTabs.Trigger.Label>Venues</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="calendar" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Icon sf="calendar" />
        <NativeTabs.Trigger.Label>Calendar</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="saved" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Icon sf={{ default: "bookmark", selected: "bookmark.fill" }} />
        <NativeTabs.Trigger.Label>Saved</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      {/* Settings lives behind the avatar on Home, not in the bar. */}
      <NativeTabs.Trigger
        name="create"
        role={OWN_CIRCLE ? "search" : undefined}
        disabled
        accessibilityLabel="New plan"
        listeners={{ tabPress: () => void startNewPlan() }}
      >
        <NativeTabs.Trigger.Icon sf="plus" />
        <NativeTabs.Trigger.Label>New plan</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
