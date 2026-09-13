import { z } from "zod";
import { VENUE_SELECT } from "../../venueColumns";
import type { MenuItem, Venue } from "../../types";
import type { ChatTool } from "./types";

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
    // Escaped, so a query containing % or _ searches for those characters
    // rather than turning into a wildcard that matches the whole catalogue.
    const needle = args.query.replace(/[\\%_]/g, (c) => `\\${c}`);

    let q = ctx.catalog
      .from("menu_items")
      .select("id,venue_id,name,category,price_ghs,notes")
      .ilike("name", `%${needle}%`);

    if (args.category) q = q.eq("category", args.category);
    if (args.max_price_ghs) q = q.lte("price_ghs", args.max_price_ghs);

    const { data, error } = await q.limit(200);
    if (error) throw new Error(`menu search failed: ${error.message}`);

    const items = (data ?? []) as MenuItem[];
    if (!items.length) {
      return {
        matches: [],
        note: `Nothing on any menu in the catalogue matches "${args.query}". Say we do not have it rather than offering something else as if it were the same.`,
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
      const hits = (byOwner.get(owner) ?? [])
        .slice()
        .sort((a, b) => Number(a.price_ghs) - Number(b.price_ghs));
      return {
        venue_id: v.id,
        venue: v.name,
        area: v.areas?.name ?? "",
        items: hits.slice(0, 4).map((m) => ({
          name: m.name,
          price_ghs: Number(m.price_ghs),
          category: m.category,
          ...(m.notes ? { notes: m.notes } : {}),
        })),
        cheapest_ghs: hits.length ? Number(hits[0].price_ghs) : null,
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
