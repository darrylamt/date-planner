/**
 * Load a native module that may not exist in the installed binary.
 *
 * JavaScript ships over the air; native code does not. So a build that went to
 * TestFlight last week can receive today's bundle, and any module added since
 * is simply not there. Expo modules resolve their native side at import, and
 * throw when it is missing, which takes down the whole screen rather than the
 * one feature that needed it.
 *
 * This is the seam between the two. A missing module returns null and the
 * caller hides the feature, so an older build keeps working and only lacks
 * what it genuinely cannot do.
 */
export function nativeOptional<T>(load: () => T): T | null {
  try {
    return load();
  } catch {
    return null;
  }
}
