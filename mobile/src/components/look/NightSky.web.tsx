import { StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

/** The web build's Night sky: the plain gradient (NightSky.tsx is the app's living one). */
export function NightSky() {
  return <LinearGradient colors={["#2E1D52", "#1B1336", "#0C0A16", "#08070E"]} locations={[0, 0.34, 0.64, 1]} style={StyleSheet.absoluteFill} />;
}
