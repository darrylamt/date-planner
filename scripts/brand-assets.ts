/**
 * Every file that carries the Duro! logo, cut from the designer's sheet.
 *
 *   npx tsx scripts/brand-assets.ts
 *
 * The source is public/brand/logo-variations.jpeg, nine colourways and six
 * icons on one 1254px JPEG. Nothing here invents a shape: the wordmark is
 * lifted from the black-on-white tile and the D from the black icon,
 * upscaled, softened and re-thresholded, so the JPEG's noise goes and the
 * edges stay smooth at 1024px. When a vector arrives, replace the two masks
 * and run this again; every output below follows.
 *
 * The marks are written white, and the web colours them in CSS, so one file
 * serves any colourway. The icons keep the old icon's rose gradient: the
 * logo changed, and the colour people know on their home screen did not.
 *
 * The app's files (icon, splash, Android layers) only reach phones with a
 * native build. An update over the air cannot change an app icon.
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";

const root = process.cwd();
const out = (p: string) => path.join(root, p);
const SRC = out("public/brand/logo-variations.jpeg");
const SCALE = 6;

type Mask = { data: Buffer; width: number; height: number };

/** 255 where the mark is, from a crop of the sheet. `dark`: the mark is darker than its tile. */
async function cut(left: number, top: number, width: number, height: number, dark: boolean): Promise<Mask> {
  let img = sharp(SRC).extract({ left, top, width, height }).greyscale();
  if (dark) img = img.negate();
  // One channel, said outright: a greyscale JPEG still comes out with three, and reading it as one stripes it.
  const { data, info } = await img.extractChannel(0).raw().toBuffer({ resolveWithObject: true });
  let x0 = info.width, y0 = info.height, x1 = 0, y1 = 0;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++)
      if (data[y * info.width + x] > 128) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
  const pad = 3;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(info.width - 1, x1 + pad); y1 = Math.min(info.height - 1, y1 + pad);
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const big = await sharp(data, { raw: { width: info.width, height: info.height, channels: 1 } })
    .extract({ left: x0, top: y0, width: w, height: h })
    .resize(w * SCALE, h * SCALE, { kernel: "lanczos3" })
    .blur(SCALE * 0.45)
    .extractChannel(0)
    .raw()
    .toBuffer({ resolveWithObject: true });
  // A narrow ramp rather than a hard cut, so the edge keeps a pixel of antialiasing.
  const m = big.data;
  for (let i = 0; i < m.length; i++) m[i] = Math.max(0, Math.min(255, (m[i] - 108) * (255 / 40)));
  return { data: m, width: big.info.width, height: big.info.height };
}

/** The mask in one colour on transparency, at a width. */
async function tint(mask: Mask, hex: string, width: number): Promise<Buffer> {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const px = Buffer.alloc(mask.width * mask.height * 4);
  for (let i = 0; i < mask.width * mask.height; i++) {
    px[i * 4] = r; px[i * 4 + 1] = g; px[i * 4 + 2] = b; px[i * 4 + 3] = mask.data[i];
  }
  return sharp(px, { raw: { width: mask.width, height: mask.height, channels: 4 } }).resize({ width }).png().toBuffer();
}

async function centred(base: sharp.Sharp, mark: Buffer, size: number) {
  const m = await sharp(mark).metadata();
  return base
    .composite([{ input: mark, left: Math.round((size - m.width!) / 2), top: Math.round((size - m.height!) / 2) }])
    .png()
    .toBuffer();
}

/** The icon: the D in white on the rose gradient the icon has always had. */
async function icon(d: Mask, size: number, rounded = false) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#E8447A"/><stop offset="1" stop-color="#A8123C"/>
    </linearGradient></defs>
    <rect width="${size}" height="${size}" ${rounded ? `rx="${Math.round(size * 0.225)}"` : ""} fill="url(#g)"/>
  </svg>`;
  return centred(sharp(Buffer.from(svg)), await tint(d, "#FFFFFF", Math.round(size * 0.58)), size);
}

/** The D alone on a transparent square: splash screens and Android's layers. */
async function markOnly(d: Mask, size: number, hex: string, share: number) {
  const blank = sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
  return centred(blank, await tint(d, hex, Math.round(size * share)), size);
}

async function main() {
  const word = await cut(20, 90, 380, 180, true); // black on off-white, top left
  const d = await cut(80, 1035, 130, 125, false); // white D on the black icon
  const write = (p: string, b: Buffer) => fs.writeFileSync(out(p), b);

  // Web: white, coloured by CSS (see Logo).
  write("public/brand/duro-wordmark.png", await tint(word, "#FFFFFF", 1200));
  write("public/brand/duro-mark.png", await tint(d, "#FFFFFF", 400));
  // Next serves these as the site's icons; duro-icon is the app icon shown on pages.
  write("src/app/icon.png", await icon(d, 512, true));
  write("src/app/apple-icon.png", await icon(d, 180));
  write("public/duro-icon.png", await icon(d, 512));

  /*
   * Link previews draw with Satori, which has no CSS masks and reads no
   * files from public/ on Vercel, so they carry their own coloured copies.
   */
  const uri = (b: Buffer) => `data:image/png;base64,${b.toString("base64")}`;
  const ogWord = uri(await tint(word, "#F3E4E8", 360));
  const ogMark = uri(await tint(d, "#1A0D14", 72));
  fs.writeFileSync(
    out("src/lib/brandImages.ts"),
    `// Generated by scripts/brand-assets.ts. Do not edit.\n` +
      `/** The wordmark in the previews' light ink, ${360}px wide. */\n` +
      `export const OG_WORDMARK = "${ogWord}";\n` +
      `/** The D in near-black, for a tile in the occasion's colours. */\n` +
      `export const OG_MARK = "${ogMark}";\n`
  );

  // App, from the next native build.
  write("mobile/assets/icon.png", await icon(d, 1024));
  write("mobile/assets/favicon.png", await icon(d, 64));
  write("mobile/assets/splash-icon.png", await markOnly(d, 512, "#C91749", 0.8));
  write("mobile/assets/splash-icon-dark.png", await markOnly(d, 512, "#FF5B8A", 0.8));
  // Inside the adaptive icon's safe circle, which a launcher may crop to.
  write("mobile/assets/android-icon-foreground.png", await markOnly(d, 1024, "#FFFFFF", 0.42));
  write("mobile/assets/android-icon-monochrome.png", await markOnly(d, 1024, "#FFFFFF", 0.42));

  console.log(`wordmark ${word.width}x${word.height}, D ${d.width}x${d.height}: all written`);
}

main();
