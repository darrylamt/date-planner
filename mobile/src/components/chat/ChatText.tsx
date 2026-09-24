import { Fragment } from "react";
import { View } from "react-native";
import { Text } from "../Text";
import { space } from "../../theme";

/**
 * The assistant's words, with the little formatting it is allowed.
 *
 * Bold, italics and bulleted lines, and nothing else. The system prompt names
 * exactly these, so this does not have to be a markdown renderer: headings,
 * tables and links are things a phone bubble has no room for, and the prompt
 * says not to write them. Anything this does not recognise is shown as the
 * characters the model wrote, which is the right failure: a stray asterisk is
 * ugly, a swallowed sentence is wrong.
 *
 * Hand-written rather than a library because every markdown package for
 * React Native either pulls in a native module, which cannot ship over the
 * air, or renders a whole document model for what is two regexes' worth of
 * work.
 */
export function ChatText({ text, tone }: { text: string; tone: "label" | "onTint" }) {
  const blocks = toBlocks(text);
  return (
    <View style={{ gap: space.xs }}>
      {blocks.map((b, i) =>
        b.kind === "bullet" ? (
          <View key={i} style={{ flexDirection: "row", gap: space.sm, paddingRight: space.xs }}>
            <Text variant="body" tone={tone}>
              {b.marker}
            </Text>
            <Text variant="body" tone={tone} style={{ flex: 1 }}>
              {inline(b.text, tone)}
            </Text>
          </View>
        ) : b.kind === "gap" ? (
          <View key={i} style={{ height: space.xs }} />
        ) : (
          <Text key={i} variant="body" tone={tone}>
            {inline(b.text, tone)}
          </Text>
        )
      )}
    </View>
  );
}

type Block =
  | { kind: "para"; text: string }
  | { kind: "bullet"; marker: string; text: string }
  | { kind: "gap" };

/**
 * Lines into paragraphs and bullets.
 *
 * A bullet the model ran into the previous sentence ("Try: - the jollof -
 * the kelewele") is split onto its own lines first, because that is the
 * shape people complained about: a list written as one run-on line.
 */
function toBlocks(text: string): Block[] {
  const lines = text
    .replace(/\r/g, "")
    .replace(/([.:!?)])\s+[-•]\s+(?=\S)/g, "$1\n- ")
    // A dash before a bolded name is always a new item. "GHS 50 - 80" is not.
    .replace(/\s+[-•]\s+(?=\*\*)/g, "\n- ")
    .split("\n");
  const out: Block[] = [];
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      if (out.length && out[out.length - 1].kind !== "gap") out.push({ kind: "gap" });
      continue;
    }
    const bullet = line.match(/^\s*(?:[-*•])\s+(.*)$/);
    if (bullet) {
      out.push({ kind: "bullet", marker: "•", text: bullet[1] });
      continue;
    }
    const numbered = line.match(/^\s*(\d{1,2})[.)]\s+(.*)$/);
    if (numbered) {
      out.push({ kind: "bullet", marker: `${numbered[1]}.`, text: numbered[2] });
      continue;
    }
    // A heading has no room here; show its words as a bold line instead.
    const heading = line.match(/^\s*#{1,6}\s+(.*)$/);
    out.push({ kind: "para", text: heading ? `**${heading[1]}**` : line });
  }
  while (out.length && out[out.length - 1].kind === "gap") out.pop();
  return out;
}

/**
 * **bold** and *italic* (or _italic_) within one line.
 *
 * Bold is matched first so its asterisks are not read as two italics. An
 * underscore only opens italics at a word boundary, so snake_case in a
 * handle like @la_villa stays as written.
 */
function inline(text: string, tone: "label" | "onTint"): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?!\w)|(?<![\w_])_(?!\s)(.+?)(?<!\s)_(?![\w_])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1] != null) {
      parts.push(
        <Text key={key++} tone={tone} weight="700">
          {m[1]}
        </Text>
      );
    } else {
      parts.push(
        <Text key={key++} tone={tone} style={{ fontStyle: "italic" }}>
          {m[2] ?? m[3]}
        </Text>
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.map((p, i) => <Fragment key={i}>{p}</Fragment>);
}

/** The words without the markers, for anything that reads the text rather than showing it. */
export function plainText(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?!\w)/g, "$1");
}
