/**
 * Turn the mascots into alternate app icons.
 *
 *   npx tsx scripts/build-app-icons.ts
 *
 * An app icon is not a sprite. The mascots are 256px with a transparent
 * background, and iOS icons must be square, opaque and large: transparency
 * renders as black on the home screen, and Apple rejects an icon that has an
 * alpha channel at all.
 *
 * So each one is composited onto its own occasion colour, padded so the
 * character is not cropped by the rounded mask iOS applies, and written out at
 * 1024. Nearest-neighbour on the way up, because these are pixel art and
 * smooth interpolation turns them to mush.
 *
 * Run this whenever a mascot sprite changes. The output is committed, since
 * the build needs the files and EAS does not run this script.
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "mobile", "assets", "mascots");
const OUT = path.join(ROOT, "mobile", "assets", "app-icons");

const SIZE = 1024;

/*
 * iOS rounds the corners and, on some surfaces, zooms slightly. Keeping the
 * mascot to roughly two thirds of the canvas means nothing important sits
 * where the mask cuts.
 */
const INSET = 0.66;

/** Each occasion on its own accent, matching the theme the app already uses. */
const ICONS: { id: string; label: string; bg: string }[] = [
  { id: "date_night", label: "Date night", bg: "#B31D50" },
  { id: "first_date", label: "First date", bg: "#A63A5C" },
  { id: "anniversary", label: "Anniversary", bg: "#9C3B44" },
  { id: "birthday", label: "Birthday", bg: "#9A5B12" },
  { id: "graduation", label: "Graduation", bg: "#0F766E" },
  { id: "celebration", label: "Celebration", bg: "#6D3F85" },
  { id: "friend_outing", label: "Friends", bg: "#376B4A" },
  { id: "solo_day", label: "Solo day", bg: "#3D5A73" },
];

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
    alpha: 1,
  };
}

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`No mascots at ${SRC}`);
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });

  const inner = Math.round(SIZE * INSET);

  for (const icon of ICONS) {
    const source = path.join(SRC, `${icon.id}.png`);
    if (!fs.existsSync(source)) {
      console.log(`  ${icon.id}: no sprite, skipped`);
      continue;
    }

    const sprite = await sharp(source)
      .resize(inner, inner, {
        kernel: sharp.kernel.nearest,
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .toBuffer();

    const target = path.join(OUT, `${icon.id}.png`);

    await sharp({
      create: {
        width: SIZE,
        height: SIZE,
        channels: 3, // No alpha at all, which is what Apple requires.
        background: hexToRgb(icon.bg),
      },
    })
      .composite([{ input: sprite, gravity: "center" }])
      /*
       * Compositing a transparent sprite puts an alpha channel back even when
       * the canvas was created without one, and Apple rejects any icon that
       * has one. Flatten fills the transparency with the background, and
       * removeAlpha drops the now-pointless channel.
       */
      .flatten({ background: hexToRgb(icon.bg) })
      .removeAlpha()
      .png({ compressionLevel: 9 })
      .toFile(target);

    const meta = await sharp(target).metadata();
    console.log(
      `  ${icon.id.padEnd(14)} ${meta.width}x${meta.height} channels=${meta.channels} alpha=${meta.hasAlpha}`
    );
  }

  console.log(`\nWritten to ${path.relative(ROOT, OUT)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
