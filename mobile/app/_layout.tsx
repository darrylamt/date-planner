import { useEffect } from "react";
import { Stack, router } from "expo-router";
import { AppState, Text } from "react-native";
import { refreshWidgets } from "../src/lib/widgets";
import { refreshLiveActivity, unfollow } from "../src/lib/liveActivity";
import { supabase } from "../src/lib/supabase";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
// Imported per weight rather than from the package root: the root re-exports
// every weight and italic, and Metro bundles the assets it can see, 14 files
// where 5 are used.
import { Figtree_400Regular } from "@expo-google-fonts/figtree/400Regular";
import { Figtree_500Medium } from "@expo-google-fonts/figtree/500Medium";
import { Figtree_600SemiBold } from "@expo-google-fonts/figtree/600SemiBold";
import { Figtree_700Bold } from "@expo-google-fonts/figtree/700Bold";
import { Figtree_800ExtraBold } from "@expo-google-fonts/figtree/800ExtraBold";
import { useIsDark, useTheme } from "../src/lib/useTheme";
import { AppearanceProvider } from "../src/lib/appearance";
import { SeasonProvider } from "../src/lib/season";
import { BurstProvider } from "../src/components/Burst";
import {
  configureNotificationHandler,
  subscribeToNotificationTaps,
} from "../src/lib/push";

// Hold the splash until the face is ready, so the first frame is not set in a
// fallback font and then reflowed.
void SplashScreen.preventAutoHideAsync();

/**
 * Everything theme-aware lives below AppearanceProvider.
 *
 * useTheme now reads the stored light/dark preference, so calling it in the
 * same component that mounts the provider would read the default and never
 * see the user's choice. Splitting the shell out is what makes the toggle
 * actually repaint the app.
 */
export default function RootLayout() {
  return (
    <AppearanceProvider>
      {/* The season sits inside the appearance, because its colours depend on light or dark. */}
      <SeasonProvider>
        <RootShell />
      </SeasonProvider>
    </AppearanceProvider>
  );
}

function RootShell() {
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
    // Hide on error too, a missing font should degrade to the system face,
    // never leave someone staring at a splash screen forever.
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  /*
   * How a reminder behaves, and where tapping one goes.
   *
   * Set at the root because both are global: without a handler a notification
   * arriving while the app is open does nothing at all, which reads as one
   * that failed rather than one politely suppressed, and a tap has to be able
   * to open a plan from any screen.
   *
   * Nothing here asks for permission. That happens once, on saving a plan for
   * a future date, where the question explains itself. See src/lib/push.ts.
   */
  useEffect(() => {
    configureNotificationHandler();
    return subscribeToNotificationTaps((url) => router.push(url as never));
  }, []);

  /*
   * The home screen widget, kept current: when the app opens and whenever it
   * comes back to the front, which is when a plan made on another phone or
   * the passing of a day would otherwise leave it saying the wrong thing.
   */
  useEffect(() => {
    void refreshWidgets();
    // Tonight's Live Activity moves along only when the app runs, so every opening moves it.
    void refreshLiveActivity();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        void refreshWidgets();
        void refreshLiveActivity();
      }
    });
    // Signing out must take the last person's plan off the home screen, and off the Lock Screen.
    const { data: auth } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") void refreshWidgets();
      if (event === "SIGNED_OUT") void unfollow();
    });
    return () => {
      sub.remove();
      auth.subscription.unsubscribe();
    };
  }, []);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* Emoji bursts thrown from buttons, over every screen. See Burst. */}
        <BurstProvider>
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
          {/* The title is never shown, it is what the next screen's back
              button borrows, which otherwise reads "(tabs)". */}
          <Stack.Screen name="(tabs)" options={{ headerShown: false, title: "Home" }} />
          <Stack.Screen name="plan/new" options={{ title: "" }} />
          {/* Pick a mood, shake, go: the night with no plan, or past the end of one. */}
          <Stack.Screen name="where-next" options={{ title: "" }} />
          {/* A focused task rather than a destination, so it is pushed like
              the planner instead of sitting in the tab bar. */}
          {/*
            Named, because "Ask" described the verb rather than the thing. A
            product people call by name is one they come back to on purpose.
            The face sits on the right, where an avatar goes.
          */}
          <Stack.Screen
            name="chat"
            options={{
              title: "Durobot",
              headerRight: () => <Text style={{ fontSize: 26 }}>🤖</Text>,
            }}
          />
          {/* No bar: the screen draws its own close button over its own stage. */}
          <Stack.Screen name="login" options={{ presentation: "modal", title: "Sign in", headerShown: false }} />
          {/*
            Out of the tab bar and behind the avatar on Home. Settings is
            somewhere people go a few times ever, and its slot now holds
            Venues, which they use every week.
          */}
          <Stack.Screen name="profile" options={{ title: "Settings" }} />
          <Stack.Screen name="venue/[id]" options={{ title: "" }} />
          {/* Full screen and gesture-locked: a half-swiped intro that lands
              back on an empty app is worse than no intro. */}
          <Stack.Screen
            name="onboarding"
            options={{ headerShown: false, gestureEnabled: false, animation: "fade" }}
          />
        </Stack>
        </BurstProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
