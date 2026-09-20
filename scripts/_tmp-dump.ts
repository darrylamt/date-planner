/** Dump a mascot as a character grid, so a new one can be drawn on its bones. */
import sharp from "sharp";
import path from "path";

const KEY: Record<string, string> = {
  "#0c1413": "K", // outline / darkest
  "#1a1210": "H", // hair
  "#8d5524": "S", // skin
  "#6f4119": "s", // skin shadow
  "#ffffff": "W",
  "#c0392b": "R",
  "#e3b23c": "Y",
  "#374752": "B", // slate dark
  "#556570": "b", // slate light
  "#4c7a56": "G",
  "#2e5c38": "g",
  "#0f766e": "T", // house teal
  "#b4536b": "P",
  "#96354d": "p",
  "#d89a2c": "O",
  "#ba7c0e": "o",
  "#f5e6d3": "C",
};

async function dump(name: string) {
  const file = path.join(process.cwd(), "mobile", "assets", "mascots", `${name}.png`);
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const { width, channels } = info;
  const cell = 8;
  const n = width / cell;

  console.log(`\n--- ${name} ---`);
  for (let y = 0; y < n; y++) {
    let row = "";
    for (let x = 0; x < n; x++) {
      const i = (y * cell * width + x * cell) * channels;
      const a = channels > 3 ? data[i + 3] : 255;
      if (a < 128) {
        row += ".";
        continue;
      }
      const hex = `#${[data[i], data[i + 1], data[i + 2]]
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("")}`;
      row += KEY[hex] ?? "?";
    }
    console.log(row);
  }
}

async function main() {
  for (const n of process.argv.slice(2)) await dump(n);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
