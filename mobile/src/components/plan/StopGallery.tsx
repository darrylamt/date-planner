import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { Symbol } from "../Symbol";
import { Text } from "../Text";
import { radius, space } from "../../theme";
import { useTheme } from "../../lib/useTheme";

const HEIGHT = 168;

/**
 * The pictures at the top of a stop, swipeable.
 *
 * A stop used to show exactly one photograph, which was the venue's, and on an
 * event that is a picture of the wrong thing: a block party is not what the
 * burger shop looks like on a Tuesday. Now the poster leads and the venue's
 * own pictures follow, which is more than one thing to show and therefore
 * needs a way to move between them.
 *
 * Both ways, deliberately. Swiping is what anybody would try first and costs
 * nothing to support; the arrows are for the times a thumb is somewhere else,
 * and they are the only affordance that says out loud that there is more than
 * one picture here. The dots do the same job more quietly.
 *
 * A ScrollView rather than a FlatList: these lists are two or three items
 * long, and virtualising three images costs more than it saves.
 */
export function StopGallery({ images, alt }: { images: string[]; alt: string }) {
  const c = useTheme();
  const scroller = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  /*
   * Measured rather than taken from the window.
   *
   * The card is inset from the screen edge, so paging on the window width
   * leaves every slide after the first sitting a gutter's width off. The
   * fallback is only for the first frame, before onLayout has fired.
   */
  const { width: windowWidth } = useWindowDimensions();
  const [width, setWidth] = useState(windowWidth);

  // A swap can shorten the list under us, and page 3 of a 1-image gallery is
  // a blank card with no way back.
  useEffect(() => {
    if (index > images.length - 1) setIndex(0);
  }, [images.length, index]);

  if (!images.length) return null;

  const single = images.length === 1;

  function goTo(next: number) {
    const clamped = Math.max(0, Math.min(images.length - 1, next));
    setIndex(clamped);
    scroller.current?.scrollTo({ x: clamped * width, animated: true });
  }

  return (
    <View
      style={{ height: HEIGHT, backgroundColor: c.skeleton }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={!single}
        onMomentumScrollEnd={(e) => {
          const at = Math.round(e.nativeEvent.contentOffset.x / width);
          setIndex(Math.max(0, Math.min(images.length - 1, at)));
        }}
      >
        {images.map((uri, i) => (
          <Image
            key={`${uri}-${i}`}
            source={{ uri }}
            style={{ width, height: HEIGHT, backgroundColor: c.skeleton }}
            contentFit="cover"
            transition={200}
            accessibilityLabel={`${alt}, picture ${i + 1} of ${images.length}`}
          />
        ))}
      </ScrollView>

      {single ? null : (
        <>
          <Arrow side="left" disabled={index === 0} onPress={() => goTo(index - 1)} />
          <Arrow
            side="right"
            disabled={index === images.length - 1}
            onPress={() => goTo(index + 1)}
          />

          {/*
            Dots over the picture rather than under it, so the card's height
            does not change with the number of images and a stop with three
            pictures does not sit taller than the one beside it.
          */}
          <View
            style={{
              position: "absolute",
              bottom: space.sm,
              left: 0,
              right: 0,
              flexDirection: "row",
              justifyContent: "center",
              gap: 5,
            }}
          >
            {images.map((_, i) => (
              <View
                key={i}
                style={{
                  width: i === index ? 16 : 6,
                  height: 6,
                  borderRadius: radius.pill,
                  // White on a photograph of unknown brightness, so it carries
                  // its own shadow rather than trusting the image behind it.
                  backgroundColor:
                    i === index ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.5)",
                  shadowColor: "#000",
                  shadowOpacity: 0.3,
                  shadowRadius: 2,
                  shadowOffset: { width: 0, height: 1 },
                }}
              />
            ))}
          </View>

          {/* The count, for when the dots run long. */}
          <View
            style={{
              position: "absolute",
              top: space.sm,
              right: space.sm,
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: radius.pill,
              backgroundColor: "rgba(0,0,0,0.45)",
            }}
          >
            <Text variant="caption2" weight="600" tabular style={{ color: "#fff" }}>
              {index + 1}/{images.length}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

function Arrow({
  side,
  disabled,
  onPress,
}: {
  side: "left" | "right";
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={side === "left" ? "Previous picture" : "Next picture"}
      style={{
        position: "absolute",
        top: HEIGHT / 2 - 16,
        [side]: space.sm,
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0,0,0,0.45)",
        // Kept in place rather than removed at the ends: a control that
        // disappears takes the next one's position with it.
        opacity: disabled ? 0 : 1,
      }}
    >
      <Symbol
        name={side === "left" ? "chevron.left" : "chevron.right"}
        size={15}
        color="#fff"
        weight="semibold"
      />
    </Pressable>
  );
}
