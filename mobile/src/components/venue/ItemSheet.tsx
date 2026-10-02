import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Image } from "expo-image";
import { Text } from "../Text";
import { Symbol } from "../Symbol";
import { Button } from "../Button";
import { GUTTER, HAIRLINE, radius, space } from "../../theme";
import { useTheme } from "../../lib/useTheme";
import { ghs } from "../../lib/format";
import type { MenuItem } from "../../lib/types";
import type { SymbolViewProps } from "expo-symbols";
import { NativeSheet } from "../native/NativeSheet";

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** 960 -> "4pm", 1170 -> "7:30pm". */
function clock(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, "0")}${suffix}` : `${h12}${suffix}`;
}

/** [1,2,3,4,5] -> "Weekdays", [0,6] -> "Weekends", [5] -> "Fri", [1,2,3] -> "Mon to Wed". */
function days(list: number[]): string {
  const set = [...new Set(list)].sort();
  const key = set.join(",");
  if (key === "1,2,3,4,5") return "Weekdays";
  if (key === "0,6") return "Weekends";
  if (set.length === 7) return "Every day";
  const run = set.every((d, i) => i === 0 || d === set[i - 1] + 1);
  if (run && set.length > 2) return `${DAY[set[0]]} to ${DAY[set[set.length - 1]]}`;
  return set.map((d) => DAY[d]).join(", ");
}

/** When this price applies, in words, or null for "always". */
export function availability(item: MenuItem): string | null {
  const parts: string[] = [];
  if (item.available_days?.length && item.available_days.length < 7) parts.push(days(item.available_days));
  const from = item.available_from_minute;
  const to = item.available_to_minute;
  if (from != null && to != null) parts.push(`${clock(from)} to ${clock(to)}`);
  else if (from != null) parts.push(`from ${clock(from)}`);
  else if (to != null) parts.push(`until ${clock(to)}`);
  return parts.length ? parts.join(", ") : null;
}

/**
 * One item, in full.
 *
 * The menu row can only give a name, a line of description and a price. Most
 * items carry more than that and none of it was reachable: 81% of dishes have
 * the menu's own description, often a list of what is in them, and most
 * activities record how long they last, how many can play, an age limit or
 * what to bring. This is where all of it goes.
 *
 * Only what the catalogue holds, and each fact said as precisely as we know
 * it. An unknown is left out rather than guessed: a drink with no alcohol
 * recorded says nothing, never "alcohol-free".
 */
export function ItemSheet({
  item: chosen,
  venueName,
  onClose,
  recommended = false,
  favouriteOnly = false,
  onRecommend,
}: {
  /** Recommended, but kept as a favourite: no visit behind it yet, so it does not count. */
  favouriteOnly?: boolean;
  item: MenuItem | null;
  venueName: string;
  onClose: () => void;
  /** Whether this account already recommends it. */
  recommended?: boolean;
  /** Absent where recommending does not apply. */
  onRecommend?: (on: boolean) => void;
}) {
  const c = useTheme();
  /*
   * Kept through the closing slide. The screen lets go of the item the
   * moment the sheet is dismissed, and the sheet is still on its way down;
   * without this it would empty itself in front of you as it went.
   */
  const [last, setLast] = useState<MenuItem | null>(chosen);
  useEffect(() => {
    if (chosen) setLast(chosen);
  }, [chosen]);
  const item = chosen ?? last;
  if (!item) return null;

  const facts: { icon: SymbolViewProps["name"]; text: string }[] = [];
  const when = availability(item);
  if (when) facts.push({ icon: "clock", text: when });
  if (item.duration_minutes) {
    const h = Math.floor(item.duration_minutes / 60);
    const m = item.duration_minutes % 60;
    facts.push({ icon: "timer", text: h ? `${h} hr${h > 1 ? "s" : ""}${m ? ` ${m} min` : ""}` : `${m} min` });
  }
  const covers = Math.max(1, item.covers_people ?? 1);
  if (covers > 1) facts.push({ icon: "person.2.fill", text: `One price covers ${covers} people` });
  const min = item.min_players && item.min_players > 1 ? item.min_players : null;
  const max = item.max_players && item.max_players > 1 ? item.max_players : null;
  if (min && max) facts.push({ icon: "person.3.fill", text: `${min} to ${max} players` });
  else if (min) facts.push({ icon: "person.3.fill", text: `At least ${min} players` });
  else if (max) facts.push({ icon: "person.3.fill", text: `Up to ${max} players` });
  if (item.min_age) facts.push({ icon: "figure.and.child.holdinghands", text: `Ages ${item.min_age} and up` });
  if (item.requires_gear) facts.push({ icon: "bag", text: item.requires_gear });
  if (item.is_alcoholic === true) facts.push({ icon: "wineglass", text: "Contains alcohol" });

  return (
    <NativeSheet visible={chosen != null} onClose={onClose}>
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
          <Text variant="footnote" tone="secondary" numberOfLines={1} style={{ flex: 1 }}>
            {venueName}
          </Text>
          <Button title="Done" kind="plain" size="medium" onPress={onClose} />
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: space.xl }}>
          {item.image_url ? (
            <Image
              source={{ uri: item.image_url }}
              style={{ width: "100%", aspectRatio: 4 / 3, backgroundColor: c.skeleton }}
              contentFit="cover"
              transition={200}
              accessibilityLabel={item.name}
            />
          ) : null}

          <View style={{ padding: GUTTER, gap: space.sm }}>
            <Text variant="title2">{item.name}</Text>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm }}>
              <Text variant="title3" tabular style={{ color: c.accent }}>
                {ghs(Number(item.price_ghs))}
              </Text>
              <Text variant="footnote" tone="secondary">
                {covers > 1 ? `for ${covers}` : "each"}
              </Text>
            </View>

            {item.notes ? (
              <Text variant="body" style={{ marginTop: space.sm }}>
                {item.notes}
              </Text>
            ) : null}

            {/*
              Recommending, right under the price, because it is the one thing
              on this sheet somebody does rather than reads. The count is real
              accounts, one each, so it is shown as a number of people.
            */}
            {onRecommend ? (
              <Pressable
                onPress={() => onRecommend(!recommended)}
                accessibilityRole="button"
                accessibilityState={{ selected: recommended }}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  alignSelf: "flex-start",
                  gap: space.sm,
                  marginTop: space.sm,
                  paddingHorizontal: space.lg,
                  paddingVertical: space.sm,
                  borderRadius: radius.pill,
                  backgroundColor: recommended ? c.accent : c.accentSoft,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Symbol name={recommended ? "hand.thumbsup.fill" : "hand.thumbsup"} size={16} color={recommended ? c.textOnBrand : c.accent} />
                <Text variant="callout" weight="600" style={{ color: recommended ? c.textOnBrand : c.accent }}>
                  {recommended ? (favouriteOnly ? "In your favourites" : "You recommend this") : "Recommend"}
                </Text>
              </Pressable>
            ) : null}
            {(item.recommend_count ?? 0) > 0 ? (
              <Text variant="footnote" tone="secondary">
                Recommended by {item.recommend_count} {item.recommend_count === 1 ? "person" : "people"} who planned a visit
              </Text>
            ) : null}

            {/* The menu's words, quoted as the menu's: never extended into a claim of ours. */}
            {item.dietary_note ? (
              <Text variant="footnote" tone="secondary" style={{ fontStyle: "italic" }}>
                Menu says: {item.dietary_note}
              </Text>
            ) : null}
          </View>

          {facts.length ? (
            <View
              style={{
                marginHorizontal: GUTTER,
                borderRadius: radius.card,
                backgroundColor: c.backgroundElement,
                paddingVertical: space.xs,
              }}
            >
              {facts.map((f, i) => (
                <View
                  key={f.text}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: space.md,
                    paddingHorizontal: space.lg,
                    paddingVertical: space.md,
                    borderTopWidth: i === 0 ? 0 : HAIRLINE,
                    borderTopColor: c.border,
                  }}
                >
                  <Symbol name={f.icon} size={17} color={c.accent} />
                  <Text variant="callout" style={{ flex: 1 }}>
                    {f.text}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          <Text variant="caption" tone="tertiary" style={{ paddingHorizontal: GUTTER, marginTop: space.lg }}>
            Prices as the venue lists them. Some places add taxes or a service charge to the bill.
          </Text>
        </ScrollView>
      </View>
    </NativeSheet>
  );
}

/** Thin wrapper so a row can open the sheet without owning its state. */
export function ItemRowPressable({ onPress, children }: { onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      {children}
    </Pressable>
  );
}
