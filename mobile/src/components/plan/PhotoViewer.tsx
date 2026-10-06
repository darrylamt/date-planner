import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Symbol } from "../Symbol";
import { Text } from "../Text";
import { radius } from "../../theme";

/**
 * A picture on its own, the whole of it, on black.
 *
 * For posters above all: a night's date, line-up and price are printed on
 * it, often small, and a card can only ever show it at the size of a card.
 * Each picture pinches to zoom (iOS's own scroll-view zoom), and they swipe
 * sideways like the strip they were opened from.
 */
export function PhotoViewer({
  images,
  start,
  open,
  onClose,
  alt,
}: {
  images: string[];
  start: number;
  open: boolean;
  onClose: () => void;
  alt: string;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pager = useRef<ScrollView>(null);
  const [index, setIndex] = useState(start);

  // Open on the picture that was tapped. contentOffset is iOS-only, so scroll there too.
  useEffect(() => {
    if (!open) return;
    setIndex(start);
    const t = setTimeout(() => pager.current?.scrollTo({ x: start * width, animated: false }), 0);
    return () => clearTimeout(t);
  }, [open, start, width]);

  return (
    <Modal visible={open} animationType="fade" onRequestClose={onClose} statusBarTranslucent supportedOrientations={["portrait"]}>
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <ScrollView
          ref={pager}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: start * width, y: 0 }}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        >
          {images.map((uri, i) => (
            <ScrollView
              key={`${uri}-${i}`}
              style={{ width, height }}
              contentContainerStyle={{ width, height, alignItems: "center", justifyContent: "center" }}
              minimumZoomScale={1}
              maximumZoomScale={4}
              bouncesZoom
              centerContent
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
            >
              <Image
                source={{ uri }}
                style={{ width, height: height - insets.top - insets.bottom - 80 }}
                contentFit="contain"
                transition={150}
                accessibilityLabel={`${alt}, picture ${i + 1} of ${images.length}`}
              />
            </ScrollView>
          ))}
        </ScrollView>

        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            top: insets.top + 8,
            left: 16,
            right: 16,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text variant="footnote" weight="600" tabular style={{ color: "rgba(255,255,255,0.8)" }}>
            {images.length > 1 ? `${index + 1} of ${images.length}` : ""}
          </Text>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={({ pressed }) => ({
              width: 36,
              height: 36,
              borderRadius: radius.pill,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(255,255,255,0.18)",
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Symbol name="xmark" size={15} color="#fff" weight="semibold" />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
