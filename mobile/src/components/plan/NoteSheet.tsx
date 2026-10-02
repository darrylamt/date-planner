import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "../Text";
import { Symbol } from "../Symbol";
import { Button } from "../Button";
import { GUTTER, HAIRLINE, radius, space, type as typeScale } from "../../theme";
import { useTheme } from "../../lib/useTheme";
import { NativeSheet } from "../native/NativeSheet";

const MAX = 400;

/**
 * A line from whoever made the plan, asked for at the moment of sending it.
 *
 * This replaces Alert.prompt, which only exists on iOS. On Android it is not
 * merely unstyled, it does nothing at all, so the note step was silently
 * skipped on the platform that is most of the phones in Accra. A real sheet
 * works everywhere and has room to say what the note is for.
 *
 * Skipping stays a first-class answer. Most cards have no note and should not
 * feel unfinished for it.
 */
export function NoteSheet({
  visible,
  initial,
  mode = "share",
  onClose,
  onDone,
}: {
  visible: boolean;
  initial: string;
  /** "share" on the way to sending the plan; "edit" to change it afterwards. */
  mode?: "share" | "edit";
  onClose: () => void;
  /** Null means skip. A string, including empty, means save that. */
  onDone: (note: string | null) => void;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState(initial);

  // Reopening should show what is already on the card, not the last draft.
  useEffect(() => {
    if (visible) setText(initial);
  }, [visible, initial]);

  return (
    <NativeSheet visible={visible} onClose={onClose} detents={["large"]}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: c.background }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
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
          <Text variant="headline">{mode === "edit" ? "Your note" : initial ? "Your note" : "Add a note"}</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Symbol name="xmark.circle.fill" size={28} color={c.textTertiary} />
          </Pressable>
        </View>

        <View style={{ padding: GUTTER, flex: 1 }}>
          <Text variant="footnote" tone="secondary" style={{ marginBottom: space.sm }}>
            A line from you. It goes at the start of your message, and at the top
            of the plan when they open the link. Why you picked this, what to
            wear, or that it is a surprise.
          </Text>

          <TextInput
            value={text}
            onChangeText={(t) => setText(t.slice(0, MAX))}
            multiline
            autoFocus
            placeholder="Wear something you can walk in"
            placeholderTextColor={c.textTertiary}
            style={{
              backgroundColor: c.backgroundElement,
              borderRadius: radius.control,
              padding: space.md,
              height: 140,
              textAlignVertical: "top",
              color: c.text,
              fontSize: typeScale.body.fontSize,
            }}
          />

          <Text
            variant="caption1"
            tone="tertiary"
            style={{ marginTop: space.xs, textAlign: "right" }}
          >
            {text.length} / {MAX}
          </Text>

          {mode === "edit" ? (
            <View style={{ marginTop: space.lg, gap: space.sm }}>
              <Button title="Save note" onPress={() => onDone(text.trim())} disabled={!text.trim() || text.trim() === initial.trim()} />
              {/* Empty is "take it off", which the plan then shows as no note at all. */}
              <Button title="Remove the note" kind="plain" onPress={() => onDone("")} />
            </View>
          ) : (
            <View style={{ marginTop: space.lg, gap: space.sm }}>
              <Button
                title={initial ? "Share with this note" : "Add it and share"}
                onPress={() => onDone(text.trim())}
                disabled={!text.trim()}
              />
              {/* Plain, not secondary: skipping is the common case, not a retreat. */}
              <Button title="Share without a note" kind="plain" onPress={() => onDone(null)} />
            </View>
          )}
        </View>

        <View style={{ height: insets.bottom }} />
      </KeyboardAvoidingView>
    </NativeSheet>
  );
}
