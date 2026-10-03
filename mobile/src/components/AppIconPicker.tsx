import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { Text } from "./Text";
import { Symbol } from "./Symbol";
import { GUTTER, HAIRLINE, radius, space } from "../theme";
import { useTheme } from "../lib/useTheme";
import { nativeOptional } from "../lib/nativeOptional";
import { NativeSheet } from "./native/NativeSheet";

/**
 * Change the icon on the home screen to one of the mascots.
 *
 * iOS only, and only for icons declared at build time: alternate icons live in
 * the binary, so nothing here can add one over the air. That is also why this
 * whole screen hides on a build that predates the feature rather than showing
 * a grid that cannot do anything.
 *
 * Worth knowing before tapping: iOS shows its own alert confirming the icon
 * changed, every time, and there is no way to suppress it. Better to expect it
 * than to think something went wrong.
 */
type IconsModule = typeof import("expo-alternate-app-icons");

const Icons = nativeOptional<IconsModule>(() => require("expo-alternate-app-icons"));

/** Name in app.json, the sprite to preview, and what to call it on screen. */
export const APP_ICONS: { name: string; label: string; source: number }[] = [
  { name: "DateNight", label: "Date night", source: require("../../assets/app-icons/date_night.png") },
  { name: "FirstDate", label: "First date", source: require("../../assets/app-icons/first_date.png") },
  { name: "Anniversary", label: "Anniversary", source: require("../../assets/app-icons/anniversary.png") },
  { name: "Birthday", label: "Birthday", source: require("../../assets/app-icons/birthday.png") },
  { name: "Graduation", label: "Graduation", source: require("../../assets/app-icons/graduation.png") },
  { name: "Celebration", label: "Celebration", source: require("../../assets/app-icons/celebration.png") },
  { name: "Friends", label: "Friends", source: require("../../assets/app-icons/friend_outing.png") },
  { name: "SoloDay", label: "Solo day", source: require("../../assets/app-icons/solo_day.png") },
  // The witch-hat pumpkin, from the Halloween logo. In the binary from build 24.
  { name: "Halloween", label: "Halloween", source: require("../../assets/app-icons/halloween.png") },
];

/**
 * What to say when an icon will not set. iOS's own reason goes to the logs,
 * not the screen: "Resource temporarily unavailable (at ExpoModulesCore/
 * Promise.swift:56)" is no use to anybody holding the phone. Restarting is
 * the one thing that has cleared this error for other apps on iOS 26.
 */
const failure = (e: unknown) => {
  console.warn("app icon", (e as { message?: string } | null)?.message);
  return "Your iPhone did not let Duro change its icon just now. Restart your phone and try again.";
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Set the icon, and once more if iOS was busy. It answers a change it cannot
 * make yet with "Resource temporarily unavailable" rather than waiting, and a
 * second asking a moment later is usually all it needed.
 */
async function setIcon(name: string | null): Promise<void> {
  if (!Icons) throw new Error("not supported on this build");
  const once = () => (name === null ? Icons.resetAppIcon() : Icons.setAlternateAppIcon(name as never).then(() => undefined));
  try {
    await once();
  } catch {
    await wait(900);
    await once();
  }
}

/**
 * Put the Halloween icon on the home screen, for the banner's one tap. iOS
 * confirms the change with its own alert. Answers with what to tell them.
 */
export async function setHalloweenIcon(): Promise<string> {
  if (!Icons?.supportsAlternateIcons) return "This phone cannot change the app's icon.";
  try {
    await setIcon("Halloween");
    return "Spooky. Check your home screen 🎃";
  } catch (e) {
    return failure(e);
  }
}

/** False on a build without the module, so Profile can hide the row entirely. */
export function appIconsAvailable(): boolean {
  return Boolean(Icons?.supportsAlternateIcons);
}

export function AppIconPicker({
  visible,
  onClose,
  onChanged,
}: {
  visible: boolean;
  onClose: () => void;
  onChanged: (message: string) => void;
}) {
  const c = useTheme();
  const [current, setCurrent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible || !Icons) return;
    try {
      setCurrent(Icons.getAppIconName());
    } catch {
      setCurrent(null);
    }
  }, [visible]);

  async function choose(name: string | null) {
    if (!Icons || busy) return;
    setBusy(true);
    void Haptics.selectionAsync();
    /*
     * Out of the sheet first, then the change.
     *
     * iOS will not change an app's icon while the app is presenting
     * something, and this picker is a sheet: every tap was asking at the one
     * moment it is refused, which is why no icon ever set, in any build. So
     * the sheet goes, the change waits for it to finish leaving, and iOS's
     * own confirmation appears over the screen underneath.
     */
    onClose();
    await wait(650);
    try {
      await setIcon(name);
      setCurrent(name);
      onChanged("Icon changed. Check your home screen.");
    } catch (e) {
      onChanged(failure(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <NativeSheet visible={visible} onClose={onClose}>
      <View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: GUTTER,
            paddingVertical: space.md,
            borderBottomWidth: HAIRLINE,
            borderBottomColor: c.border,
          }}
        >
          <Text variant="headline">App icon</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Symbol name="xmark.circle.fill" size={28} color={c.textTertiary} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{
            padding: GUTTER,
            paddingBottom: space.xl, // the sheet pads for the home indicator
          }}
        >
          <Text variant="footnote" tone="secondary" style={{ marginBottom: space.md }}>
            iOS will ask you to confirm each time. That alert is Apple&apos;s, not ours.
          </Text>

          <View
            style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}
          >
            {/* The original first, so getting back is never a puzzle. */}
            <IconTile
              label="Original"
              selected={current === null}
              onPress={() => void choose(null)}
              source={require("../../assets/icon.png")}
            />
            {APP_ICONS.map((icon) => (
              <IconTile
                key={icon.name}
                label={icon.label}
                source={icon.source}
                selected={current === icon.name}
                onPress={() => void choose(icon.name)}
              />
            ))}
          </View>
        </ScrollView>
      </View>
    </NativeSheet>
  );

  function IconTile({
    label,
    source,
    selected,
    onPress,
  }: {
    label: string;
    source: number;
    selected: boolean;
    onPress: () => void;
  }) {
    return (
      <Pressable
        onPress={onPress}
        disabled={busy}
        style={{ width: "31%", alignItems: "center", marginBottom: space.lg }}
      >
        <View
          style={{
            width: 72,
            height: 72,
            // Roughly the iOS squircle, close enough to preview honestly.
            borderRadius: 16,
            overflow: "hidden",
            borderWidth: selected ? 2.5 : HAIRLINE,
            borderColor: selected ? c.accent : c.border,
          }}
        >
          <Image source={source} style={{ width: "100%", height: "100%" }} contentFit="cover" />
        </View>
        <Text
          variant="caption1"
          tone={selected ? "tint" : "secondary"}
          center
          numberOfLines={1}
          style={{ marginTop: space.xs }}
        >
          {label}
        </Text>
      </Pressable>
    );
  }
}
