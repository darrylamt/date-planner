import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { BlurView } from "expo-blur";
import { Symbol } from "../../src/components/Symbol";
import { useIsDark, useTheme } from "../../src/lib/useTheme";

/**
 * Three top-level destinations. A tab bar rather than a stack because these
 * are peers — you move between planning and your saved plans constantly, and
 * pushing/popping made "Saved" feel like a detour off the home screen.
 *
 * The planner flow itself lives outside this group: it is a focused, linear
 * task, and a visible tab bar mid-questionnaire invites people to abandon it.
 */
export default function TabsLayout() {
  const c = useTheme();
  const isDark = useIsDark();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.tint,
        tabBarInactiveTintColor: c.secondaryLabel,
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600" },
        // Translucent bar so content scrolls under it, as iOS does natively.
        tabBarStyle: Platform.select({
          ios: {
            position: "absolute",
            borderTopColor: c.separator,
            backgroundColor: "transparent",
          },
          default: { backgroundColor: c.surface, borderTopColor: c.separator },
        }),
        tabBarBackground:
          Platform.OS === "ios"
            ? () => (
                <BlurView
                  tint={isDark ? "systemChromeMaterialDark" : "systemChromeMaterialLight"}
                  intensity={80}
                  style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
                />
              )
            : undefined,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Plan",
          tabBarIcon: ({ color }) => <Symbol name="sparkles" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          title: "Saved",
          tabBarIcon: ({ color }) => <Symbol name="bookmark.fill" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "You",
          tabBarIcon: ({ color }) => (
            <Symbol name="person.crop.circle" size={24} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
