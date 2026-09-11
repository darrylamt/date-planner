import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Text } from "./Text";
import { Symbol } from "./Symbol";
import { GUTTER, HAIRLINE, radius, space } from "../theme";
import { useTheme } from "../lib/useTheme";
import { nativeOptional } from "../lib/nativeOptional";

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
];

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
  const insets = useSafeAreaInsets();
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
    try {
      if (name === null) {
        await Icons.resetAppIcon();
        setCurrent(null);
      } else {
        await Icons.setAlternateAppIcon(name as never);
        setCurrent(name);
      }
      onChanged("Icon changed. Check your home screen.");
    } catch {
      onChanged("That icon could not be set.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: c.background }}>
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
            paddingBottom: insets.bottom + space.xl,
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
    </Modal>
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
