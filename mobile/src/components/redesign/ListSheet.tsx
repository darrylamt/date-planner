import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Text } from "../Text";
import { Symbol } from "../Symbol";
import { Button } from "../Button";
import { GUTTER, HAIRLINE, radius, space, type as typeScale } from "../../theme";
import { useTheme } from "../../lib/useTheme";
import { NativeSheet } from "../native/NativeSheet";
import { createList, renameList, setInList, type StarList } from "../../lib/stars";

/**
 * Star lists (0113, Pro), in one sheet so no sheet ever opens over another:
 *
 * - with a venue: tick the lists it is in, or make a new one and it goes in;
 * - with a list to rename: its name;
 * - with neither: a new, empty list.
 *
 * "pro" comes back when the database says lists are Pro, and the caller
 * offers Pro.
 */
export function ListSheet({
  visible,
  venue,
  rename,
  lists,
  onClose,
  onChanged,
  onPro,
}: {
  visible: boolean;
  venue?: { id: string; name: string } | null;
  rename?: StarList | null;
  lists: StarList[];
  onClose: () => void;
  onChanged: (lists: StarList[]) => void;
  onPro: () => void;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setName(rename?.name ?? "");
    setError(null);
  }, [visible, rename]);

  const title = rename ? "Rename list" : venue ? `Lists for ${venue.name}` : "New list";

  async function toggle(list: StarList) {
    if (!venue) return;
    const on = !list.venueIds.includes(venue.id);
    void Haptics.selectionAsync();
    const next = lists.map((l) => (l.id === list.id ? { ...l, venueIds: on ? [...l.venueIds, venue.id] : l.venueIds.filter((v) => v !== venue.id) } : l));
    onChanged(next);
    const r = await setInList(list.id, venue.id, on);
    if (r !== "ok") {
      onChanged(lists);
      if (r === "pro") onPro();
      else setError("That did not save. Try again when you have signal.");
    }
  }

  async function save() {
    const clean = name.trim();
    if (!clean) return;
    setBusy(true);
    setError(null);
    if (rename) {
      const ok = await renameList(rename.id, clean);
      setBusy(false);
      if (!ok) return setError("That did not save. Try again when you have signal.");
      onChanged(lists.map((l) => (l.id === rename.id ? { ...l, name: clean } : l)));
      onClose();
      return;
    }
    const { result, list } = await createList(clean);
    if (result !== "ok" || !list) {
      setBusy(false);
      if (result === "pro") return onPro();
      return setError("That did not save. Try again when you have signal.");
    }
    let made = list;
    if (venue && (await setInList(list.id, venue.id, true)) === "ok") made = { ...list, venueIds: [venue.id] };
    setBusy(false);
    setName("");
    onChanged([...lists, made]);
    if (!venue) onClose();
  }

  return (
    <NativeSheet visible={visible} onClose={onClose} detents={["large"]}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
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
          <Text variant="headline" numberOfLines={1} style={{ flex: 1, marginRight: space.md }}>
            {title}
          </Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
            <Symbol name="xmark.circle.fill" size={28} color={c.textTertiary} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: GUTTER, gap: space.sm }} keyboardShouldPersistTaps="handled">
          {venue && !rename
            ? lists.map((l) => {
                const on = l.venueIds.includes(venue.id);
                return (
                  <Pressable
                    key={l.id}
                    onPress={() => void toggle(l)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    style={{ flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.control, backgroundColor: c.backgroundElement }}
                  >
                    <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>
                      {l.name}
                    </Text>
                    <Text variant="footnote" tone="tertiary">
                      {l.venueIds.length}
                    </Text>
                    <Symbol name={on ? "checkmark.circle.fill" : "circle"} size={24} color={on ? c.accent : c.textTertiary} />
                  </Pressable>
                );
              })
            : null}

          {venue && !rename ? (
            <Text variant="footnote" tone="secondary" style={{ marginTop: lists.length ? space.md : 0 }}>
              {lists.length ? "Or make a new list, and it goes in:" : "Make your first list, and it goes in. Date spots, birthday ideas, places to try."}
            </Text>
          ) : (
            <Text variant="footnote" tone="secondary">
              {rename ? "A new name for this list." : "Date spots, birthday ideas, places to try."}
            </Text>
          )}

          <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
            <TextInput
              value={name}
              onChangeText={(t) => setName(t.slice(0, 40))}
              placeholder={rename ? rename.name : "List name"}
              placeholderTextColor={c.textTertiary}
              autoFocus={!venue || Boolean(rename)}
              returnKeyType="done"
              onSubmitEditing={() => void save()}
              style={{
                flex: 1,
                backgroundColor: c.backgroundElement,
                borderRadius: radius.control,
                paddingHorizontal: space.md,
                paddingVertical: space.sm + 4,
                color: c.text,
                fontSize: typeScale.body.fontSize,
              }}
            />
            <Button title={rename ? "Save" : "Add"} onPress={() => void save()} disabled={!name.trim() || busy} />
          </View>

          {error ? (
            <Text variant="footnote" style={{ color: c.danger }}>
              {error}
            </Text>
          ) : null}
        </ScrollView>
        <View style={{ height: insets.bottom }} />
      </KeyboardAvoidingView>
    </NativeSheet>
  );
}
