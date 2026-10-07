import { z } from "zod";

/**
 * A shared bill, read from its own link.
 *
 * The app's split screen puts the whole breakdown in the link it sends
 * (/b/<code>, the code being base64url of a small JSON object), so a bill
 * needs no account, no table and no request to anything but this page. The
 * link is the record, which also means anybody can write one: so it is
 * checked hard here, kept short, never indexed, and shown as what it is, a
 * bill somebody split, never as a claim Duro makes.
 *
 * The app's encoder is encodeBillLink in mobile/src/lib/bill.ts.
 */

const schema = z.object({
  v: z.literal(1),
  /** The plan's title, when the bill came from a plan. */
  t: z.string().max(80).optional(),
  /** Total in whole cedis. */
  c: z.number().int().min(0).max(1_000_000),
  /** Index of who paid. */
  w: z.number().int().min(0).max(11),
  /** Their MoMo number, if they gave one. */
  m: z.string().max(20).regex(/^[+\d\s-]*$/).optional(),
  /** [name, share] for each person. */
  p: z.array(z.tuple([z.string().min(1).max(24), z.number().int().min(0).max(1_000_000)])).min(2).max(12),
});

export type SharedBill = z.infer<typeof schema>;

export function readBill(code: string): SharedBill | null {
  if (!code || code.length > 1200 || !/^[A-Za-z0-9_-]+$/.test(code)) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(Buffer.from(code, "base64url").toString("utf8")));
    if (!parsed.success) return null;
    const bill = parsed.data;
    return bill.w < bill.p.length ? bill : null;
  } catch {
    return null;
  }
}

export const isMeName = (name: string) => /^me$/i.test(name.trim());
