import { noteMiss, NOTED } from "./shared";
import { z } from "zod";
import { VENUE_SELECT } from "../../venueColumns";
import type { MenuItem, Venue } from "../../types";
import type { ChatTool } from "./types";
import { accentPattern, fold, foldIncludes } from "../../fold";

/**
 * Find a dish, and say where it is actually served.
 *
 * The subtle part is that a menu row belongs to whichever venue owns the
 * menu, not to every venue that serves from it. Search "jollof" and the hit
 * lands on The Honeysuckle - Osu; the four branches that pour from the same
 * kitchen hold no rows of their own. Answering from the hit alone sends
 * somebody in Achimota across town to Osu for a plate available up the road.
 *
 * So the search runs on rows and the answer is assembled on venues: find the
 * dish, find its owner, then find everybody who serves that owner's menu.
 */
const MATCH_LIMIT = 8;

const argsSchema = z.object({
  query: z.string().min(2).max(60),
  areas: z.array(z.string()).max(6).optional(),
  max_price_ghs: z.number().positive().optional(),
  category: z
    .enum(["starter", "main", "dessert", "drink", "activity", "other"])
    .optional(),
});

export type SearchMenuItemsArgs = z.infer<typeof argsSchema>;

export const searchMenuItems: ChatTool<SearchMenuItemsArgs> = {
  name: "search_menu_items",
  description:
    "Find a specific dish or drink across every menu in the catalogue, with " +
    "its real price and every venue that serves it. Use for questions like " +
    "'where can I get jollof under 100'. Returns nothing when nobody serves it, " +
    "which means say so.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Dish or drink name, e.g. jollof, cocktail, waakye." },
      areas: {
        type: "array",
        items: { type: "string" },
        description: "Restrict to these neighbourhoods.",
      },
      max_price_ghs: { type: "number", description: "Ceiling for the item's own price." },
      category: {
        enum: ["starter", "main", "dessert", "drink", "activity", "other"],
        description: "Restrict to one course or kind.",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
  parse: (raw) => argsSchema.parse(raw),

  async run(args, ctx) {
    /*
     * However it is accented, either side: "creme brulee" is "Crème brûlée"
     * (fold.ts). Two reads: the words as typed without accents, which is
     * exact and finds every plainly spelt name; and the accent pattern, which
     * widens accented letters, over only the names with an accent in them, so
     * a short word like "sauté" does not match half the catalogue and push
     * the real answers past the limit. Every row is checked once more below.
     */
    const base = () => {
      let q = ctx.catalog
        .from("menu_items")
        // "*" so the recommendation count arrives without a named column that
        // would fail on a database without 0063.
        .select("*");
      if (args.category) q = q.eq("category", args.category);
      if (args.max_price_ghs) q = q.lte("price_ghs", args.max_price_ghs);
      return q;
    };
    const plain = fold(args.query.trim()).replace(/[\\%_]/g, (c) => `\\${c}`);
    const [asTyped, accented] = await Promise.all([
      base().ilike("name", `%${plain}%`).limit(300),
      // Any character outside plain ASCII: an accent, a curly quote, an emoji.
      base().ilike("name", accentPattern(args.query)).filter("name", "match", "[^ -~]").limit(300),
    ]);
    const error = asTyped.error ?? accented.error;
    if (error) throw new Error(`menu search failed: ${error.message}`);

    const seen = new Set<string>();
    const items = ([...(asTyped.data ?? []), ...(accented.data ?? [])] as MenuItem[]).filter(
      (m) => !seen.has(m.id) && (seen.add(m.id), foldIncludes(m.name, args.query.trim()))
    );
    if (!items.length) {
      const noted = await noteMiss(ctx.admin, "dish", args.query, (args as { areas?: string[] }).areas?.[0]);
      return {
        matches: [],
        note: `Nothing on any menu in the catalogue matches "${args.query}". Say we do not have it rather than offering something else as if it were the same.${noted ? NOTED : ""}`,
      };
    }

    const ownerIds = [...new Set(items.map((m) => m.venue_id))];

    /*
     * Everyone who serves these menus: the owners themselves, and every branch
     * pointing at one. Two queries rather than one because PostgREST has no
     * OR across two `in` filters that stays readable.
     */
    const [ownersRes, branchesRes] = await Promise.all([
      ctx.catalog.from("venues").select(VENUE_SELECT).in("id", ownerIds).eq("is_active", true),
      ctx.catalog
        .from("venues")
        .select(VENUE_SELECT)
        .in("menu_shared_from", ownerIds)
        .eq("is_active", true),
    ]);

    if (ownersRes.error) throw new Error(`venue lookup failed: ${ownersRes.error.message}`);
    if (branchesRes.error) throw new Error(`branch lookup failed: ${branchesRes.error.message}`);

    const serving = [
      ...((ownersRes.data ?? []) as unknown as Venue[]),
      ...((branchesRes.data ?? []) as unknown as Venue[]),
    ];

    const byOwner = new Map<string, MenuItem[]>();
    for (const m of items) {
      const list = byOwner.get(m.venue_id) ?? [];
      list.push(m);
      byOwner.set(m.venue_id, list);
    }

    let rows = serving.map((v) => {
      const owner = v.menu_shared_from || v.id;
      // Most recommended first, then cheapest: "where is good jollof" is
      // answered by the jollof people liked before the jollof that is cheap.
      const hits = (byOwner.get(owner) ?? [])
        .slice()
        .sort(
          (a, b) =>
            (b.recommend_count ?? 0) - (a.recommend_count ?? 0) || Number(a.price_ghs) - Number(b.price_ghs)
        );
      return {
        venue_id: v.id,
        venue: v.name,
        area: v.areas?.name ?? "",
        items: hits.slice(0, 4).map((m) => ({
          name: m.name,
          price_ghs: Number(m.price_ghs),
          category: m.category,
          ...(m.notes ? { notes: m.notes } : {}),
          ...((m.recommend_count ?? 0) > 0 ? { recommended_by: m.recommend_count } : {}),
        })),
        cheapest_ghs: hits.length ? Math.min(...hits.map((m) => Number(m.price_ghs))) : null,
      };
    });

    if (args.areas?.length) {
      const wanted = args.areas.map((a) => a.trim().toLowerCase()).filter(Boolean);
      rows = rows.filter((r) => {
        const name = r.area.toLowerCase();
        return wanted.some((w) => name === w || name.includes(w) || w.includes(name));
      });
    }

    rows = rows
      .filter((r) => r.items.length)
      .sort((a, b) => (a.cheapest_ghs ?? Infinity) - (b.cheapest_ghs ?? Infinity))
      .slice(0, MATCH_LIMIT);

    if (!rows.length) {
      return {
        matches: [],
        note: `Found "${args.query}" on a menu, but not anywhere matching the rest of what was asked. Say which part could not be met.`,
      };
    }

    return { matches: rows };
  },
};
