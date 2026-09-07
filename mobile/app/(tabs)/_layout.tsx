import { Tabs } from "expo-router";
import { TabBar } from "../../src/components/TabBar";
import { startNewPlan } from "../../src/lib/startPlan";

/**
 * Three destinations, plus the create action as a peer of the bar rather than
 * a tab — it starts a task, it does not switch destination.
 *
 * The planner flow itself stays outside this group: it is a focused linear
 * task, and a persistent nav mid-questionnaire invites abandonment.
 */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} onCreate={() => void startNewPlan()} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="saved" options={{ title: "Saved" }} />
      <Tabs.Screen name="profile" options={{ title: "You" }} />
    </Tabs>
  );
}
