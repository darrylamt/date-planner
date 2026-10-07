/**
 * A venue's listing, scored, as things to do.
 *
 * Each line is something the planner or the app actually uses: no hours and
 * we cannot promise you are open, no prices and you are left out of plans
 * with a budget, no picture and nobody picks you. Named one at a time
 * because "60% complete" on its own tells nobody what to do next.
 */

export const CHECKLIST_VENUE_COLUMNS =
  "image_url, gallery_urls, description, cuisines, opening_periods, phone, whatsapp_phone, booking_url, instagram_handle, menu_shared_from";

export interface Check {
  ok: boolean;
  label: string;
  why: string;
  /** Path under /venue, with an anchor where it helps. */
  href: string;
  /** Matters most first: these are what the home screen shows. */
  weight: number;
}

export function venueChecklist(v: Record<string, unknown> | null, menu: { notes?: unknown; image_url?: unknown }[]): Check[] {
  const withNotes = menu.filter((m) => String(m.notes ?? "").trim()).length;
  const withPics = menu.filter((m) => String(m.image_url ?? "").trim()).length;
  const checks: Check[] = [
    menu.length === 0
      ? { ok: false, label: "Put your menu on, with prices", why: "Places without prices are left out of plans with a budget.", href: "/venue/menu", weight: 10 }
      : {
          ok: menu.length >= 10,
          label: "Add the rest of your menu",
          why: `${menu.length} item${menu.length === 1 ? "" : "s"} so far. With 10 or more, plans can order a proper meal from you.`,
          href: "/venue/menu",
          weight: 10,
        },
    { ok: Boolean(v?.image_url), label: "Add a main photo", why: "Every card leads with it. Nobody picks a place they can't see.", href: "/venue/listing#photos", weight: 9 },
    {
      ok: Array.isArray(v?.opening_periods) && (v?.opening_periods as unknown[]).length > 0,
      label: "Set your opening hours",
      why: "We only send people to places we know are open.",
      href: "/venue/hours",
      weight: 8,
    },
    {
      ok: Boolean(v?.booking_url || v?.whatsapp_phone || v?.phone),
      label: "Add a way to book",
      why: "A phone, WhatsApp or booking link turns a plan into a table.",
      href: "/venue/listing#contact",
      weight: 7,
    },
    { ok: String(v?.description ?? "").trim().length > 40, label: "Describe your place", why: "A sentence or two in your own words.", href: "/venue/listing#about", weight: 6 },
    { ok: ((v?.cuisines as string[] | null) ?? []).length > 0, label: "Say what food you serve", why: "So somebody craving it finds you.", href: "/venue/listing#about", weight: 5 },
    {
      ok: ((v?.gallery_urls as string[] | null) ?? []).length >= 3,
      label: "Add three more photos",
      why: "People swipe through them before they choose.",
      href: "/venue/listing#photos",
      weight: 4,
    },
    {
      ok: menu.length > 0 && withPics >= Math.min(5, menu.length),
      label: "Photograph your best dishes",
      why: `${withPics} of your dishes have a picture. Five changes what people order.`,
      href: "/venue/menu",
      weight: 3,
    },
    {
      ok: menu.length > 0 && withNotes / menu.length >= 0.6,
      label: "Describe most of your dishes",
      why: `${withNotes} of ${menu.length} have a description.`,
      href: "/venue/menu",
      weight: 2,
    },
    { ok: Boolean(v?.instagram_handle), label: "Add your Instagram", why: "People check it before they go.", href: "/venue/listing#contact", weight: 1 },
  ];
  return checks;
}

export function checklistScore(checks: Check[]): number {
  return Math.round((100 * checks.filter((c) => c.ok).length) / checks.length);
}
