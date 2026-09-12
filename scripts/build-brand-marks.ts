/**
 * Bake the sign-in provider marks into PNGs.
 *
 *   npx tsx scripts/build-brand-marks.ts
 *
 * The login screen showed a letter "G" typed in the app's own font, which is
 * not Google's logo, it is the letter G. The real mark is four colours and a
 * specific shape, and a provider button wearing an approximation looks like a
 * phishing page rather than a sign-in.
 *
 * PNG rather than SVG because react-native-svg is not installed, and adding it
 * would be a new native module: the JavaScript would ship over the air to a
 * binary that has no such module compiled in, and the screen would crash on
 * open. That is the exact mistake that took the Profile tab down earlier.
 * Assets, unlike native modules, do travel with an EAS update.
 *
 * Rendered at 3x for the largest size used, so it stays sharp on every screen.
 */
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import sharp from "sharp";

const OUT = join(process.cwd(), "mobile", "assets", "brand");

/** Google's "G", the standard four-colour mark on a 48pt grid. */
const GOOGLE_G = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
</svg>`;

/**
 * The Apple mark, in one colour so it can be drawn black or white.
 *
 * Two files rather than one tinted at runtime: expo-image has no tint on every
 * platform, and a logo that quietly fails to tint is an invisible button.
 */
const appleMark = (fill: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <path fill="${fill}" d="M17.05 12.536c-.024-2.67 2.18-3.95 2.28-4.013-1.24-1.816-3.17-2.064-3.86-2.092-1.64-.166-3.2.965-4.03.965-.83 0-2.11-.94-3.47-.915-1.79.026-3.44 1.04-4.36 2.64-1.86 3.22-.475 7.99 1.33 10.6.88 1.28 1.93 2.71 3.31 2.66 1.33-.053 1.83-.86 3.44-.86 1.6 0 2.06.86 3.46.833 1.43-.026 2.34-1.3 3.21-2.58 1.01-1.48 1.43-2.91 1.45-2.985-.032-.014-2.78-1.067-2.81-4.235zM14.47 4.6c.73-.886 1.22-2.117 1.09-3.345-1.05.043-2.32.7-3.07 1.584-.674.784-1.264 2.037-1.106 3.24 1.17.09 2.36-.594 3.09-1.48z"/>
</svg>`;

async function render(name: string, svg: string, size: number) {
  const png = await sharp(Buffer.from(svg))
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const file = join(OUT, name);
  writeFileSync(file, png);

  // Printed rather than assumed: a mark with no alpha has a white box behind
  // it, which on a dark button is exactly as wrong as the letter G was.
  const meta = await sharp(png).metadata();
  console.log(
    `  ${name.padEnd(20)} ${meta.width}x${meta.height}  channels=${meta.channels}  alpha=${meta.hasAlpha}`
  );
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  // 3x the 26pt drawn size, with headroom for a larger button later.
  await render("google.png", GOOGLE_G, 96);
  await render("apple-black.png", appleMark("#000000"), 96);
  await render("apple-white.png", appleMark("#FFFFFF"), 96);
  console.log(`\nWritten to ${OUT}`);
}

void main();
