import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Text } from "../Text";
import { Symbol } from "../Symbol";
import { radius, space, type as typeScale } from "../../theme";
import { useTheme } from "../../lib/useTheme";

/**
 * Who is in: names as chips, tap the cross to take one out, type to add.
 * Two at the least, because a wheel with one name and a bill for one are
 * not questions.
 */
export function PeopleEditor({
  names,
  onChange,
  max = 12,
}: {
  names: string[];
  onChange: (names: string[]) => void;
  max?: number;
}) {
  const c = useTheme();
  const [typed, setTyped] = useState("");

  function add() {
    const name = typed.trim().slice(0, 24);
    if (!name || names.length >= max) return;
    // Two Kofis are two people; the second is told apart rather than refused.
    const taken = new Set(names.map((n) => n.toLowerCase()));
    let unique = name;
    for (let i = 2; taken.has(unique.toLowerCase()); i++) unique = `${name} ${i}`;
    void Haptics.selectionAsync();
    onChange([...names, unique]);
    setTyped("");
  }

  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        {names.map((n, i) => (
          <View
            key={`${n}-${i}`}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingLeft: space.md,
              paddingRight: names.length > 2 ? 6 : space.md,
              paddingVertical: 7,
              borderRadius: radius.pill,
              backgroundColor: c.backgroundSelected,
            }}
          >
            <Text variant="subheadline" weight="600">
              {n}
            </Text>
            {names.length > 2 ? (
              <Pressable
                onPress={() => onChange(names.filter((_, j) => j !== i))}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${n}`}
                style={{ width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: c.backgroundElement }}
              >
                <Symbol name="xmark" size={10} weight="bold" color={c.textSecondary} />
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>

      {names.length < max ? (
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <TextInput
            value={typed}
            onChangeText={setTyped}
            onSubmitEditing={add}
            returnKeyType="done"
            blurOnSubmit={false}
            placeholder="Add a name"
            placeholderTextColor={c.textTertiary}
            autoCapitalize="words"
            maxLength={24}
            style={{
              flex: 1,
              backgroundColor: c.backgroundElement,
              borderRadius: radius.control,
              paddingHorizontal: space.md,
              paddingVertical: 11,
              color: c.text,
              fontSize: typeScale.body.fontSize,
            }}
          />
          <Pressable
            onPress={add}
            disabled={!typed.trim()}
            accessibilityRole="button"
            accessibilityLabel="Add this name"
            style={({ pressed }) => ({
              paddingHorizontal: space.lg,
              borderRadius: radius.control,
              justifyContent: "center",
              backgroundColor: typed.trim() ? c.accent : c.backgroundSelected,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text variant="callout" weight="700" style={{ color: typed.trim() ? c.textOnBrand : c.textTertiary }}>
              Add
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
