import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { Symbol } from "../Symbol";
import { PhotoViewer } from "./PhotoViewer";
import { Text } from "../Text";
import { radius, space } from "../../theme";
import { useTheme } from "../../lib/useTheme";

const HEIGHT = 168;
/*
 * An event's card, whose first picture is its poster. Posters are mostly
 * portrait and carry the date and line-up in print, so the strip is taller
 * there; a venue's photographs are landscape and keep the shorter strip.
 */
const POSTER_HEIGHT = 240;

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
export function StopGallery({ images, alt, poster = false }: { images: string[]; alt: string; poster?: boolean }) {
  const c = useTheme();
  const HEIGHT_HERE = poster ? POSTER_HEIGHT : HEIGHT;
  const [viewing, setViewing] = useState<number | null>(null);
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
      style={{ height: HEIGHT_HERE, backgroundColor: c.skeleton }}
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
          <Slide
            key={`${uri}-${i}`}
            uri={uri}
            width={width}
            height={HEIGHT_HERE}
            label={`${alt}, picture ${i + 1} of ${images.length}`}
            onOpen={() => setViewing(i)}
          />
        ))}
      </ScrollView>

      <PhotoViewer images={images} start={viewing ?? 0} open={viewing !== null} onClose={() => setViewing(null)} alt={alt} />

      {single ? null : (
        <>
          <Arrow side="left" top={HEIGHT_HERE / 2 - 16} disabled={index === 0} onPress={() => goTo(index - 1)} />
          <Arrow
            side="right"
            top={HEIGHT_HERE / 2 - 16}
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

/**
 * One picture in the strip.
 *
 * A picture much taller than the strip, which is most posters, used to be
 * cropped to its middle, and the middle of a poster is rarely where the date
 * is. Such a picture is now shown whole, over a blurred and darkened copy of
 * itself so the strip is still filled edge to edge, the way Instagram and
 * Spotify show a portrait picture in a landscape frame. Ordinary landscape
 * photographs are unchanged. Either way, a tap opens it full screen.
 */
function Slide({
  uri,
  width,
  height,
  label,
  onOpen,
}: {
  uri: string;
  width: number;
  height: number;
  label: string;
  onOpen: () => void;
}) {
  const c = useTheme();
  const [whole, setWhole] = useState(false);

  return (
    <Pressable onPress={onOpen} accessibilityRole="imagebutton" accessibilityLabel={`${label}. Opens it full screen.`}>
      <View style={{ width, height, backgroundColor: c.skeleton, overflow: "hidden" }}>
        {whole ? (
          <>
            <Image source={{ uri }} style={{ position: "absolute", top: 0, left: 0, width, height }} contentFit="cover" blurRadius={28} />
            <View style={{ position: "absolute", top: 0, left: 0, width, height, backgroundColor: "rgba(0,0,0,0.28)" }} />
          </>
        ) : null}
        <Image
          source={{ uri }}
          style={{ width, height }}
          contentFit={whole ? "contain" : "cover"}
          transition={200}
          onLoad={(e) => {
            const { width: w, height: h } = e.source;
            /*
             * Square or portrait (most posters), or far narrower than the
             * strip: cropping would lose the top and bottom. A 3:2 landscape
             * photograph loses a sliver to the crop and is better filling it.
             */
            if (w > 0 && h > 0 && (w / h < 1.1 || w / h < (width / height) * 0.6)) setWhole(true);
          }}
        />
        {whole ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: space.sm,
              bottom: space.sm,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: radius.pill,
              backgroundColor: "rgba(0,0,0,0.5)",
            }}
          >
            <Symbol name="arrow.up.left.and.arrow.down.right" size={11} color="#fff" weight="semibold" />
            <Text variant="caption2" weight="600" style={{ color: "#fff" }}>
              See it all
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function Arrow({
  side,
  top,
  disabled,
  onPress,
}: {
  side: "left" | "right";
  top: number;
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
        top,
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
