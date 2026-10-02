import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";
import { nativeOptional } from "./nativeOptional";

/**
 * SwiftUI controls, where the installed build has them.
 *
 * @expo/ui arrived with build 23 (the widget brought it). Build 22 phones run
 * the same runtime and take the same updates, and every one of its views is
 * looked up natively the moment the module is imported, so importing it there
 * takes the screen down. Checked first, required second, and null means use
 * the control the app had before.
 */
const present = Platform.OS === "ios" && requireOptionalNativeModule("ExpoUI") != null;

export const swiftUI: typeof import("@expo/ui/swift-ui") | null = present
  ? nativeOptional(() => require("@expo/ui/swift-ui"))
  : null;

export const swiftMods: typeof import("@expo/ui/swift-ui/modifiers") | null = present
  ? nativeOptional(() => require("@expo/ui/swift-ui/modifiers"))
  : null;
