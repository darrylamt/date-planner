import { Modal, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Text } from "./Text";
import { Symbol } from "./Symbol";
import { Mascot } from "./Mascot";
import { GUTTER, HAIRLINE, radius, space } from "../theme";
import { useTheme } from "../lib/useTheme";
import { OCCASIONS } from "../lib/planConstants";
import type { Occasion } from "../lib/types";

/**
 * Pick a face.
 *
 * A mascot first, a photograph second. Most people do not have a picture of
 * themselves they want on a plan they are about to send someone, and the
 * mascots already exist and already carry the app's character, so offering
 * them removes both the awkwardness and the upload.
 *
 * The photo route stays for anyone who does want their own face, and hides
 * itself on a build that has no image picker rather than failing when tapped.
 */
export function AvatarPicker({
  visible,
  onClose,
  current,
  onPickMascot,
  onPickPhoto,
  photoAvailable,
}: {
  visible: boolean;
  onClose: () => void;
  /** The mascot currently in use, if any. */
  current: string | null;
  onPickMascot: (occasion: Occasion) => void;
  onPickPhoto: () => void;
  photoAvailable: boolean;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();

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
          <Text variant="headline">Choose a face</Text>
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
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: "space-between",
            }}
          >
            {OCCASIONS.map((o) => {
              const on = current === o.id;
              return (
                <Pressable
                  key={o.id}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    onPickMascot(o.id as Occasion);
                  }}
                  style={{
                    width: "31%",
                    alignItems: "center",
                    paddingVertical: space.md,
                    marginBottom: space.sm,
                    borderRadius: radius.control,
                    backgroundColor: on ? c.backgroundSelected : c.backgroundElement,
                    borderWidth: on ? 1.5 : HAIRLINE,
                    borderColor: on ? c.accent : c.border,
                  }}
                >
                  {/* Still, not animating: eight sprites all cycling at once
                      turns a chooser into a fairground. */}
                  <Mascot occasion={o.id as Occasion} size={56} animate={false} />
                  <Text
                    variant="caption1"
                    tone={on ? "tint" : "secondary"}
                    center
                    numberOfLines={1}
                    style={{ marginTop: space.xs }}
                  >
                    {o.title}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {photoAvailable ? (
            <Pressable
              onPress={onPickPhoto}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: space.md,
                padding: space.md,
                marginTop: space.md,
                borderRadius: radius.control,
                backgroundColor: c.backgroundElement,
                borderWidth: HAIRLINE,
                borderColor: c.border,
              }}
            >
              <Symbol name="photo" size={22} color={c.textSecondary} />
              <View style={{ flex: 1 }}>
                <Text variant="body">Use a photo instead</Text>
                <Text variant="footnote" tone="secondary">
                  From your library
                </Text>
              </View>
              <Symbol name="chevron.right" size={14} color={c.textTertiary} />
            </Pressable>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}
