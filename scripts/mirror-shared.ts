/**
 * Copy the shared modules from the web app into the mobile app.
 *
 *   npm run mirror          # write the mobile copies
 *   npm run mirror -- --check   # fail if any copy is stale (for CI)
 *
 * These five modules are the vocabulary both clients speak: the domain types,
 * the questionnaire's options, the budget bounds and the formatting helpers.
 * They were kept in step by hand, and drift here is not a cosmetic problem,
 * when the mobile copy of the occasion list fell behind the web one, four
 * occasion cards silently started the wrong pathway, because the stale copy
 * rejected occasions the rest of the app had already started sending.
 *
 * Nothing here imports from outside src/lib, so a straight copy is safe. The
 * header is rewritten on the way through so the mobile file says plainly that
 * it is generated and where the original lives.
 */
import fs from "fs";
import path from "path";

const FILES = [
  "budget.ts",
  "format.ts",
  "planConstants.ts",
  "pickups.ts",
  "pronouns.ts",
  "swapStop.ts",
  "types.ts",
];

const root = process.cwd();
const from = path.join(root, "src", "lib");
const to = path.join(root, "mobile", "src", "lib");

const check = process.argv.includes("--check");

/** The old hand-written header, so it is replaced rather than stacked up. */
const OLD_HEADER = /^\/\*\*\r?\n \* MIRRORED from the web app:[\s\S]*?\*\/\r?\n/;

function header(file: string): string {
  return [
    "/**",
    ` * GENERATED, do not edit. Mirrored from src/lib/${file}.`,
    " *",
    " * Run `npm run mirror` after changing the web copy.",
    " */",
    "",
  ].join("\n");
}

let stale: string[] = [];

for (const file of FILES) {
  const source = fs.readFileSync(path.join(from, file), "utf8").replace(OLD_HEADER, "");
  const next = header(file) + source;
  const target = path.join(to, file);

  const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
  if (current === next) continue;

  if (check) {
    stale.push(file);
    continue;
  }

  fs.writeFileSync(target, next);
  console.log(`  mirrored ${file}`);
}

if (check && stale.length) {
  console.error(
    `\nThese mobile copies are behind the web originals:\n` +
      stale.map((f) => `  mobile/src/lib/${f}`).join("\n") +
      `\n\nRun: npm run mirror\n`
  );
  process.exit(1);
}

console.log(check ? "Mobile copies are in step." : "Done.");
