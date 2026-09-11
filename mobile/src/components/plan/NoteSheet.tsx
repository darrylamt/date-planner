import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "../Text";
import { Symbol } from "../Symbol";
import { Button } from "../Button";
import { GUTTER, HAIRLINE, radius, space, type as typeScale } from "../../theme";
import { useTheme } from "../../lib/useTheme";

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
  onClose,
  onDone,
}: {
  visible: boolean;
  initial: string;
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
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
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
          <Text variant="headline">Add a note</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Symbol name="xmark.circle.fill" size={28} color={c.textTertiary} />
          </Pressable>
        </View>

        <View style={{ padding: GUTTER, flex: 1 }}>
          <Text variant="footnote" tone="secondary" style={{ marginBottom: space.sm }}>
            One line on the card, from you. Why you picked this, what to wear, or
            that it is a surprise.
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

          <View style={{ marginTop: space.lg, gap: space.sm }}>
            <Button
              title="Add it and share"
              onPress={() => onDone(text.trim())}
              disabled={!text.trim()}
            />
            {/* Plain, not secondary: skipping is the common case, not a retreat. */}
            <Button title="Share without a note" kind="plain" onPress={() => onDone(null)} />
          </View>
        </View>

        <View style={{ height: insets.bottom }} />
      </KeyboardAvoidingView>
    </Modal>
  );
}
