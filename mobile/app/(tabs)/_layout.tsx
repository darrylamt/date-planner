import { Tabs } from "expo-router";
import { TabBar } from "../../src/components/TabBar";

/**
 * Three top-level destinations behind a custom floating pill bar.
 *
 * The planner flow deliberately lives outside this group: it is a focused,
 * linear task, and a persistent nav mid-questionnaire invites abandonment.
 */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" options={{ title: "Plan" }} />
      <Tabs.Screen name="saved" options={{ title: "Saved" }} />
      <Tabs.Screen name="profile" options={{ title: "You" }} />
    </Tabs>
  );
}
