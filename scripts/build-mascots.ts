/**
 * Draw the occasion mascots.
 *
 *   npx tsx scripts/build-mascots.ts
 *
 * The originals were drawn by hand, and reading them back told us how: a
 * 32x32 logical grid rendered at 8 pixels a cell, every figure sharing one
 * head and one pair of legs, and differing only in a seven-row torso and a
 * prop held out to one side. Two new pathways needed two new mascots, and
 * matching that by eye would have produced something a shade off in the skin
 * tone or a pixel out in the shoulders, which on a screen showing eight of
 * them side by side reads as a different artist.
 *
 * So the shared parts are shared here rather than copied, and each mascot is
 * the small amount that is actually its own. The blink and bounce frames are
 * derived, because that is what they were: blink closes the eyes in place,
 * bounce is the whole figure one cell lower with the bottom row clipped.
 *
 * PNG at 256x256 with nearest-neighbour scaling, which is what the existing
 * files are and what keeps the pixels square. Assets travel in an EAS update,
 * so new mascots reach an installed build without a new binary.
 */
import { writeFileSync } from "fs";
import { join } from "path";
import sharp from "sharp";

const OUT = join(process.cwd(), "mobile", "assets", "mascots");
const CELL = 8;
const GRID = 32;

/**
 * The palette, read back out of the existing sprites.
 *
 * Everything above the divider is already in use; a new colour below it is a
 * deliberate addition, and there are only as many as the two new outfits need.
 */
const PALETTE: Record<string, string> = {
  K: "#0c1413", // outline, and the darkest shape
  H: "#1a1210", // hair, and shoes
  S: "#8d5524", // skin
  s: "#6f4119", // skin in shadow: arms, legs
  W: "#ffffff",
  R: "#c0392b", // the tie
  Y: "#e3b23c", // gold: the sun, a star
  B: "#374752", // slate, dark
  b: "#556570", // slate, light
  G: "#4c7a56",
  g: "#2e5c38",
  T: "#0f766e", // the house teal
  P: "#b4536b",
  p: "#96354d",
  O: "#d89a2c",
  o: "#ba7c0e",
  C: "#f5e6d3",
  // ── added for these two ──────────────────────────────────────────────
  N: "#2c3e50", // navy, dark: the second suit
  n: "#46617a", // navy, light
  t: "#0b5a54", // teal in shadow, so a teal shirt folds like the green one
};

type Block = string[];

/** Everything above the collar. Identical in every mascot, so it lives once. */
const HEAD: Block = [
  "......KKK.....",
  "...KKKHHHKKK..",
  "..KHHHHHHHHHK.",
  ".KHHHHHHHHHHHK",
  "KHHHHHHHHHHHHH",
  "KHHHHHHHHHHHHK",
  "KHHHHHHHHHHHHK",
  "KSSSSSHHHSSSSS",
  "KSSSWWSSWWSSSS",
  "KSSSWKSSKWSSSS",
  ".KSSSSSSSSSSSK",
  "..KSSKKKKSSSK.",
  "...KSSSSSSSK..",
  "....KKSSSKK...",
  ".KKKKKssKKKKK.",
];

/** Hips, legs and shoes. Also identical everywhere. */
const LEGS: Block = [
  ".KKKssKKssKKK.",
  "...KssKKssK...",
  "...KssKKssK...",
  "...KssKKssK...",
  "..KHHHHHHHHK..",
  "..KHHHHHHHHK..",
  "...KKKKKKKK...",
];

/** The smaller adult who stands to the right, from the friends mascot. */
const SECOND_HEAD: Block = [
  "....K....",
  "KKKKHKKK.",
  "KHHHHHHHK",
  "HHHHHHHHH",
  "KHHHHHHHK",
  "KSSSHSSSK",
  "SSSKSSKSS",
  "KSSSSSSSK",
  "KSSKKKSSK",
  ".KSSSSSK.",
  "..KssKK..",
  ".KKssKK..",
];

const SECOND_LEGS: Block = [
  ".KssKsK..",
  ".KssKsK..",
  ".KssKsK..",
  ".KssKsK..",
  "KHHHHHHK.",
  "KHHHHHHK.",
  ".KKKKKK..",
];

/**
 * A child: the same construction, two thirds the height.
 *
 * Eyes are dark cells rather than whites, which is how the smaller figure on
 * the friends mascot is drawn. It also means the blink frame has nothing to do
 * here, and a child whose eyes stayed open while the adult blinked would look
 * like a rendering fault rather than a second character.
 */
const CHILD: Block = [
  "...KKK...",
  "..KHHHK..",
  ".KHHHHHK.",
  ".KSSHSSK.",
  ".KSKSKSK.",
  ".KSSSSSK.",
  "..KSSSK..",
  "...KsK...",
  ".KKKsKKK.",
  ".K11111K.",
  ".K11111K.",
  ".KS111SK.",
  ".KS111SK.",
  ".KKsKsKK.",
  "..KsKsK..",
  "..KsKsK..",
  ".KHHHHHK.",
  "..KKKKK..",
];

/** A sun, for the one pathway that is mostly about being outside. */
const SUN: Block = [
  "...Y...",
  ".Y.Y.Y.",
  "..YYY..",
  "YYYYYYY",
  "..YYY..",
  ".Y.Y.Y.",
  "...Y...",
];

/** Seven rows of torso, which is all that separates one mascot from another. */
const SUIT_SLATE: Block = [
  "KBBbWWRRWWBBBK",
  "KBBbWRWWRWBBBK",
  "KBBbbbbbbBBBBK",
  "KBBbbbbbbBBBBK",
  "KBBbbbbbbBBBBK",
  "KSSbbbbbbBBSSK",
  "KSSbbbbbbBBSSK",
];

const TEE_TEAL: Block = [
  "KttTTTTTTttttK",
  "KttTTTTTTttttK",
  "KttTTTTTTttttK",
  "KttTTTTTTttttK",
  "KttTTTTTTttttK",
  "KSSTTTTTTttSSK",
  "KSSTTTTTTttSSK",
];

const SUIT_NAVY: Block = [
  "KNNWWNNK.",
  "KNNWWNNK.",
  "KNNnnNNK.",
  "KNNnnNNK.",
  "KNNnnNNK.",
  "KNNnnNNK.",
  "KNNnnNNK.",
];

type Canvas = string[][];

function blank(): Canvas {
  return Array.from({ length: GRID }, () => Array.from({ length: GRID }, () => "."));
}

/** Draw a block at a position. A dot in the block leaves what is underneath. */
function stamp(canvas: Canvas, block: Block, x0: number, y0: number, swap?: Record<string, string>) {
  block.forEach((row, dy) => {
    [...row].forEach((ch, dx) => {
      if (ch === ".") return;
      const y = y0 + dy;
      const x = x0 + dx;
      if (y < 0 || y >= GRID || x < 0 || x >= GRID) return;
      canvas[y][x] = swap?.[ch] ?? ch;
    });
  });
}

/** The figure that carries the head, torso and legs, at x=9. */
function figure(canvas: Canvas, torso: Block) {
  stamp(canvas, HEAD, 9, 3);
  stamp(canvas, torso, 9, 18);
  stamp(canvas, LEGS, 9, 25);
}

/**
 * Close the eyes without moving anything else.
 *
 * Row 11 is the whites and row 12 the pupils. The whites become skin and the
 * pupils become the outline colour, which leaves a dark line where the eye
 * was -- the same two rows the existing blink frames change, and nothing else.
 */
function blink(canvas: Canvas): Canvas {
  const next = canvas.map((r) => [...r]);
  for (let x = 0; x < GRID; x++) {
    if (next[11][x] === "W") next[11][x] = "S";
    if (next[12][x] === "W") next[12][x] = "K";
  }
  return next;
}

/** One cell lower, bottom row clipped. That is the whole bounce frame. */
function bounce(canvas: Canvas): Canvas {
  const next = blank();
  for (let y = 0; y < GRID - 1; y++) {
    for (let x = 0; x < GRID; x++) next[y + 1][x] = canvas[y][x];
  }
  return next;
}

async function render(name: string, canvas: Canvas) {
  const size = GRID * CELL;
  const raw = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const ch = canvas[Math.floor(y / CELL)][Math.floor(x / CELL)];
      const i = (y * size + x) * 4;
      if (ch === ".") continue; // transparent
      const hex = PALETTE[ch];
      if (!hex) throw new Error(`${name}: no colour for "${ch}"`);
      raw[i] = parseInt(hex.slice(1, 3), 16);
      raw[i + 1] = parseInt(hex.slice(3, 5), 16);
      raw[i + 2] = parseInt(hex.slice(5, 7), 16);
      raw[i + 3] = 255;
    }
  }

  const png = await sharp(raw, { raw: { width: size, height: size, channels: 4 } })
    .png()
    .toBuffer();
  writeFileSync(join(OUT, `${name}.png`), png);
  console.log(`   ${name}.png`);
}

/** Two people in smart clothes. A meeting is never one person. */
function businessMeeting(): Canvas {
  const c = blank();
  figure(c, SUIT_SLATE);
  stamp(c, SECOND_HEAD, 23, 6);
  stamp(c, SUIT_NAVY, 23, 18);
  stamp(c, SECOND_LEGS, 23, 25);
  return c;
}

/** An adult, a child, and the sun they are going out under. */
function familyDay(): Canvas {
  const c = blank();
  stamp(c, SUN, 1, 2);
  figure(c, TEE_TEAL);
  stamp(c, CHILD, 22, 14, { "1": "Y" });
  return c;
}

async function main() {
  const mascots: Record<string, Canvas> = {
    business_meeting: businessMeeting(),
    family_day: familyDay(),
  };

  for (const [name, canvas] of Object.entries(mascots)) {
    console.log(name);
    await render(name, canvas);
    await render(`${name}_blink`, blink(canvas));
    await render(`${name}_bounce`, bounce(canvas));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
