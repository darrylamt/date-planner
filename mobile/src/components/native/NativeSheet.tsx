import { useEffect, useRef, type ReactNode } from "react";
import { Modal, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppearance } from "../../lib/appearance";
import { useIsDark, useTheme } from "../../lib/useTheme";
import { swiftMods, swiftUI } from "../../lib/swiftUI";

/**
 * A sheet the height of what is in it, presented by SwiftUI.
 *
 * The app's sheets were React Native page sheets, which on an iPhone are
 * always nearly full height: a birthday picker and two buttons sat at the top
 * of a screen of empty background. SwiftUI sizes the sheet to its content,
 * gives it the system grabber and swipe, and on iOS 26 the floating glass a
 * short sheet has everywhere else on the phone.
 *
 * Built the way @expo/ui's own bottom-sheet wrapper is (community/
 * bottom-sheet/BottomSheet.ios.tsx): a zero-height Host, the sheet, and the
 * React Native content inside an RNHostView that measures it. Two things it
 * does not do, and this has to:
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
  children,
}: {
  visible: boolean;
  /** Somebody dismissed it themselves: a swipe down or a tap outside. */
  onClose: () => void;
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
  if (!ui || !m) {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        <View style={{ flex: 1, backgroundColor: c.background, paddingBottom: insets.bottom }}>{children}</View>
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
        fitToContents
      >
        <ui.Group
          modifiers={[
            // Makes an iPad sheet the content's size too, instead of nearly full height.
            m.presentationSizing("fitted"),
            m.presentationDragIndicator("visible"),
            ...(preference === "system" ? [] : [m.presentationBackground(c.background)]),
          ]}
        >
          <ui.RNHostView matchContents>
            {/* Width from the window; height from the content, which is what matchContents measures. */}
            <View style={{ width, paddingTop: 16, paddingBottom: insets.bottom }}>{children}</View>
          </ui.RNHostView>
        </ui.Group>
      </ui.BottomSheet>
    </ui.Host>
  );
}
