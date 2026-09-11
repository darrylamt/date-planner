import { useEffect, useState } from "react";
import { Redirect, Tabs } from "expo-router";
import { TabBar } from "../../src/components/TabBar";
import { startNewPlan } from "../../src/lib/startPlan";
import { hasOnboarded } from "../../src/lib/onboarding";

/**
 * Four destinations, plus the create action as a peer of the bar rather than
 * a tab, it starts a task, it does not switch destination.
 *
 * The planner flow itself stays outside this group: it is a focused linear
 * task, and a persistent nav mid-questionnaire invites abandonment.
 */
export default function TabsLayout() {
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
    <Tabs
      tabBar={(props) => <TabBar {...props} onCreate={() => void startNewPlan()} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="calendar" options={{ title: "Calendar" }} />
      <Tabs.Screen name="saved" options={{ title: "Saved" }} />
      <Tabs.Screen name="profile" options={{ title: "You" }} />
    </Tabs>
  );
}
