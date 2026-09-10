import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
// Imported per weight rather than from the package root: the root re-exports
// every weight and italic, and Metro bundles the assets it can see — 14 files
// where 5 are used.
import { Figtree_400Regular } from "@expo-google-fonts/figtree/400Regular";
import { Figtree_500Medium } from "@expo-google-fonts/figtree/500Medium";
import { Figtree_600SemiBold } from "@expo-google-fonts/figtree/600SemiBold";
import { Figtree_700Bold } from "@expo-google-fonts/figtree/700Bold";
import { Figtree_800ExtraBold } from "@expo-google-fonts/figtree/800ExtraBold";
import { useIsDark, useTheme } from "../src/lib/useTheme";

// Hold the splash until the face is ready, so the first frame is not set in a
// fallback font and then reflowed.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const c = useTheme();
  const isDark = useIsDark();

  const [fontsLoaded, fontError] = useFonts({
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
    Figtree_800ExtraBold,
  });

  useEffect(() => {
    // Hide on error too — a missing font should degrade to the system face,
    // never leave someone staring at a splash screen forever.
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

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
          {/* The title is never shown — it is what the next screen's back
              button borrows, which otherwise reads "(tabs)". */}
          <Stack.Screen name="(tabs)" options={{ headerShown: false, title: "Home" }} />
          <Stack.Screen name="plan/new" options={{ title: "" }} />
          <Stack.Screen name="login" options={{ presentation: "modal", title: "Sign in" }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
