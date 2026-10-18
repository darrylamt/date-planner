import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import { Redirect, router } from "expo-router";
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
  // New plan is opened here so it is counted (0085); it still resumes a draft, as before.
  const onQuickAction = useCallback((action: { id: string }) => {
    if (action.id !== "new-plan") return false;
    router.navigate("/plan/new?from=quick_action");
    return true;
  }, []);
  useQuickActionRouting(onQuickAction);
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
        <NativeTabs.Trigger.Icon sf={{ default: "house", selected: "house.fill" }} md="home" />
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      {/* Second, beside Home: finding a place is the thing people do between plans. */}
      <NativeTabs.Trigger name="venues" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Icon sf={{ default: "map", selected: "map.fill" }} md="map" />
        <NativeTabs.Trigger.Label>Venues</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      {/*
        New plan, in the middle where a thumb finds it. On iOS 26 the search
        role draws it as its own circle of glass at the end of the bar instead.
      */}
      <NativeTabs.Trigger
        name="create"
        role={OWN_CIRCLE ? "search" : undefined}
        disabled
        accessibilityLabel="New plan"
        listeners={{ tabPress: () => void startNewPlan(undefined, "tab_plus") }}
      >
        <NativeTabs.Trigger.Icon sf="plus" md="add" />
        <NativeTabs.Trigger.Label>New plan</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      {/* Plans: what used to be Saved and Calendar, one list with a calendar view. */}
      <NativeTabs.Trigger name="saved" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Icon sf={{ default: "calendar", selected: "calendar" }} md="calendar_month" />
        <NativeTabs.Trigger.Label>Plans</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      {/*
        Durobot opens the one chat screen rather than living inside the tab:
        chat lays its keyboard and composer out under a header, and a second
        copy here would be a second conversation. So, like New plan, the tap
        is refused and the chat is pushed.
      */}
      <NativeTabs.Trigger
        name="durobot"
        disabled
        accessibilityLabel="Durobot, ask Duro"
        listeners={{ tabPress: () => router.navigate("/chat") }}
      >
        <NativeTabs.Trigger.Icon sf={{ default: "bubble.left", selected: "bubble.left.fill" }} md="forum" />
        <NativeTabs.Trigger.Label>Durobot</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
