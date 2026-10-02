import { useEffect, useRef, type ReactNode } from "react";
import { Modal, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppearance } from "../../lib/appearance";
import { useIsDark, useTheme } from "../../lib/useTheme";
import { swiftMods, swiftUI } from "../../lib/swiftUI";

export type SheetDetent = "medium" | "large";

/**
 * A sheet presented by SwiftUI: sized to what is in it, or at the heights
 * it can be dragged between.
 *
 * The app's sheets were React Native page sheets, which on an iPhone are
 * always nearly full height: a birthday picker and two buttons sat at the top
 * of a screen of empty background. SwiftUI sizes the sheet to its content,
 * or opens it halfway with room to pull it up, gives it the system grabber
 * and swipe, and on iOS 26 the floating glass a short sheet has everywhere
 * else on the phone.
 *
 * - No `detents`: the content's own height. For short sheets, whose
 *   content must not set flex: 1 (there is no height to fill).
 * - `detents`: those heights, starting at the first, and the content fills
 *   the sheet, so a header and a ScrollView with flex: 1 work as they did.
 *   ["large"] alone for sheets with typing in them, so the field is never
 *   under the keyboard at half height.
 *
 * Built the way @expo/ui's own bottom-sheet wrapper is (community/
 * bottom-sheet/BottomSheet.ios.tsx): a zero-height Host, the sheet, and the
 * React Native content inside an RNHostView. Two things it does not do, and
 * this has to:
 *
 * - Colour. That wrapper leaves the sheet to the system's light or dark,
 *   and Duro has its own setting. Following the phone, the sheet keeps the
 *   system's glass; set to light or dark in the app, it takes the app's
 *   background, or white text would sit on a white sheet.
 * - Who closed it. `onClose` is for somebody swiping the sheet away. When
 *   the screen closes it itself (Save, an answer), SwiftUI reports the
 *   dismissal too, and passing that on would answer twice: a sheet that
 *   asks for consent would hear "allow" and then "not now".
 *
 * Without SwiftUI (build 22) it is the page sheet it always was.
 */
export function NativeSheet({
  visible,
  onClose,
  detents,
  children,
}: {
  visible: boolean;
  /** Somebody dismissed it themselves: a swipe down or a tap outside. */
  onClose: () => void;
  detents?: SheetDetent[];
  children: ReactNode;
}) {
  const c = useTheme();
  const isDark = useIsDark();
  const { preference } = useAppearance();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const open = useRef(visible);
  useEffect(() => {
    open.current = visible;
  }, [visible]);

  const ui = swiftUI;
  const m = swiftMods;
  const fit = !detents || detents.length === 0;

  if (!ui || !m) {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        {/* A fitted sheet's content has no flex of its own; a tall one brings its own insets. */}
        <View style={{ flex: 1, backgroundColor: c.background, paddingBottom: fit ? insets.bottom : 0 }}>{children}</View>
      </Modal>
    );
  }

  return (
    <ui.Host
      style={{ position: "absolute", width }}
      pointerEvents="none"
      colorScheme={isDark ? "dark" : "light"}
      seedColor={c.accent}
    >
      <ui.BottomSheet
        isPresented={visible}
        onIsPresentedChange={(presented) => {
          // Still meant to be open, so this was a person, not the screen.
          if (!presented && open.current) onClose();
        }}
        fitToContents={fit}
      >
        <ui.Group
          modifiers={[
            ...(fit
              ? // Makes an iPad sheet the content's size too, instead of nearly full height.
                [m.presentationSizing("fitted")]
              : [m.presentationDetents(detents)]),
            m.presentationDragIndicator("visible"),
            ...(preference === "system" ? [] : [m.presentationBackground(c.background)]),
          ]}
        >
          <ui.RNHostView matchContents={fit}>
            {fit ? (
              /* Width from the window; height from the content, which is what matchContents measures. */
              <View style={{ width, paddingTop: 16, paddingBottom: insets.bottom }}>{children}</View>
            ) : (
              /* The sheet's height, filled: flexGrow with a zero basis, as the @expo/ui wrapper does. */
              <View style={{ flexGrow: 1, height: 0, paddingTop: 10 }}>{children}</View>
            )}
          </ui.RNHostView>
        </ui.Group>
      </ui.BottomSheet>
    </ui.Host>
  );
}
