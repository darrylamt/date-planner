import { View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen } from "../src/components/Screen";
import { Text } from "../src/components/Text";
import { Button } from "../src/components/Button";
import { Group, Row } from "../src/components/List";
import { Symbol } from "../src/components/Symbol";
import { GUTTER, space } from "../src/theme";
import { useTheme } from "../src/lib/useTheme";
import { useAuth } from "../src/lib/useAuth";

export default function Home() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();

  return (
    <Screen grouped contentStyle={{ paddingTop: insets.top + space.xxxl }}>
      <View style={{ paddingHorizontal: GUTTER, marginBottom: space.xxxl }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Symbol name="flame.fill" size={26} />
          <Text variant="largeTitle" style={{ fontSize: 40, lineHeight: 46 }}>
            aduro
          </Text>
        </View>
        <Text variant="title3" tone="secondary" weight="400" style={{ marginTop: space.sm }}>
          A date planned with intention.
        </Text>
        <Text variant="body" tone="secondary" style={{ marginTop: space.md }}>
          Tell us the budget, the vibe and a little about them. We build the whole
          evening across Accra — real menus, real prices, transport included.
        </Text>
      </View>

      <View style={{ paddingHorizontal: GUTTER, marginBottom: space.xxxl }}>
        <Button title="Plan a date" icon="sparkles" onPress={() => router.push("/plan/new")} />
      </View>

      <Group header="How it works">
        <Row
          icon="mappin.and.ellipse"
          title="Pick an area and a budget"
          subtitle="Osu, Labone, Cantonments — or let us surprise you"
        />
        <Row
          icon="heart.text.square"
          title="Tell us about them"
          subtitle="Food they love, places they like, anything to avoid"
        />
        <Row
          icon="list.bullet.rectangle"
          title="Get a full itinerary"
          subtitle="Back-to-back stops that stay inside your budget"
        />
      </Group>

      <Group>
        <Row
          icon="bookmark.fill"
          title="Saved plans"
          chevron
          onPress={() => router.push("/plans")}
        />
        {session ? (
          <Row
            icon="person.crop.circle"
            title={session.user.email ?? "Signed in"}
            subtitle="Signed in"
            chevron
            onPress={() => router.push("/login")}
          />
        ) : (
          <Row
            icon="person.crop.circle"
            title="Sign in"
            subtitle="Save plans and share them"
            chevron
            onPress={() => router.push("/login")}
          />
        )}
      </Group>

      <Text
        variant="caption1"
        tone="tertiary"
        center
        style={{ paddingHorizontal: GUTTER, marginTop: space.sm }}
      >
        Prices are estimates and change. We show transport as an estimate too.
      </Text>
    </Screen>
  );
}
