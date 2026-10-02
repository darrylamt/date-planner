import { ActionSheetIOS, Alert, Platform } from "react-native";

export interface SheetAction {
  text: string;
  onPress: () => void;
  destructive?: boolean;
}

/**
 * A choice between actions, as the phone asks it: the action sheet that rises
 * from the bottom, the options in a stack under a title, Cancel set apart.
 *
 * These were alerts, which are for news and a yes or no. "Call, WhatsApp or
 * Instagram?" and "Delete this plan?" are choices of what to do next, which
 * is what iOS gives an action sheet for, and on iOS 26 it is drawn in glass
 * like every other one on the phone. UIKit's own, through React Native, so it
 * needs nothing a build might be missing.
 *
 * Android has no action sheet; the same choices go in an alert there.
 */
export function chooseAction({
  title,
  message,
  actions,
  cancel = "Cancel",
  dark,
}: {
  title: string;
  message?: string;
  actions: SheetAction[];
  cancel?: string;
  /** The app's own light or dark, when it differs from the phone's. */
  dark?: boolean;
}) {
  if (Platform.OS === "ios") {
    const options = [...actions.map((a) => a.text), cancel];
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        message,
        options,
        cancelButtonIndex: options.length - 1,
        destructiveButtonIndex: actions.flatMap((a, i) => (a.destructive ? [i] : [])),
        ...(dark === undefined ? {} : { userInterfaceStyle: dark ? "dark" : "light" }),
      },
      (index) => {
        if (index < actions.length) actions[index].onPress();
      }
    );
    return;
  }
  Alert.alert(title, message, [
    ...actions.map((a) => ({ text: a.text, onPress: a.onPress, style: a.destructive ? ("destructive" as const) : ("default" as const) })),
    { text: cancel, style: "cancel" as const },
  ]);
}
