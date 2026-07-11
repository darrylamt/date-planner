import Anthropic from "@anthropic-ai/sdk";

/** Server-side only — never import from client components. */
export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const MODEL = "claude-sonnet-4-6";

/**
 * Defensive JSON extraction: strips markdown fences and any stray prose
 * around the outermost JSON object before parsing.
 */
export function parseModelJson<T>(raw: string): T {
  let text = raw.trim();
  // Strip ```json ... ``` fences
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  // Fall back to the outermost object braces if prose leaked in
  if (!text.startsWith("{")) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("No JSON object in model output");
    text = text.slice(start, end + 1);
  }
  return JSON.parse(text) as T;
}

export function textFromResponse(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}
