import AsyncStorage from "@react-native-async-storage/async-storage";

/*
 * "I'm visiting Ghana" (0106, owner 4 Nov 2026): castles, museums and parks
 * charge visitors from abroad about four times what Ghanaians pay. With this
 * on, plans and trips price sights at the visitor rate where one is known.
 * Kept on this phone; it is about the person holding it, not an account.
 */
const KEY = "duro.visitor.v1";

export async function isVisitor(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) === "1";
  } catch {
    return false;
  }
}

export async function setVisitor(on: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    // Not remembered this time; plans simply use Ghanaian prices.
  }
}
