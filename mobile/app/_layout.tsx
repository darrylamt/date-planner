import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useIsDark, useTheme } from "../src/lib/useTheme";

export default function RootLayout() {
  const c = useTheme();
  const isDark = useIsDark();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style={isDark ? "light" : "dark"} />
        <Stack
          screenOptions={{
            headerTintColor: c.accent,
            headerTitleStyle: { color: c.text },
            headerStyle: { backgroundColor: c.background },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: c.background },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          {/* The questionnaire is a focused task — no tab bar, no swipe-back
              that would silently discard a half-answered plan. */}
          <Stack.Screen
            name="plan/new"
            options={{ title: "", headerBackTitle: "Back", gestureEnabled: false }}
          />
          <Stack.Screen name="login" options={{ presentation: "modal", title: "Sign in" }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
