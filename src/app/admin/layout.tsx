import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { AdminChrome } from "@/components/admin/AdminChrome";
import { AdminActivity } from "@/components/admin/AdminActivity";
import type { PaletteVenue } from "@/components/admin/CommandPalette";
import { adminCounts } from "@/lib/adminCounts";
import { adminAccess, type StaffRole } from "@/lib/staff";

export const dynamic = "force-dynamic";

/**
 * /admin, for admins (profiles.is_admin) and staff logins (staff_roles, 0095),
 * who see only their own pages.
 *
 * The frame draws at once and the sidebar's counts stream in after it: they
 * used to be awaited here, so every admin page sat blank for the five seconds
 * it took to count the menus before a single pixel arrived.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Staff sign in with a username (staff.ts); the page also offers the owner's own sign-in.
  if (!user) redirect("/staff/login");

  // An admin, or a staff login with at least one role (0095).
  const access = await adminAccess();

  if (!access) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col items-center justify-center px-9 text-center">
        <div className="vic h-14 w-14 rounded-bar text-[24px]">🔒</div>
        <h1 className="mt-6 font-display text-[28px] font-bold">Admins only</h1>
        <p className="mt-3 text-body text-mutedbrown">
          Your account isn&apos;t flagged as an admin. Set <code>is_admin = true</code> on your profile row in Supabase to
          get in.
        </p>
        <Link href="/" className="btn2 btnsm mt-6 px-6">
          Back home
        </Link>
      </main>
    );
  }

  const email = user.email ?? "";
  const who = { isAdmin: access.isAdmin, roles: access.roles };
  return (
    <div className="admin adm-root">
      <Suspense fallback={<AdminChrome counts={null} venues={null} email={email} access={who} />}>
        <ChromeWithCounts email={email} access={who} />
      </Suspense>
      <main className="adm-main">
        <div className="adm-content">{children}</div>
      </main>
      <Suspense fallback={null}>
        <AdminActivity />
      </Suspense>
    </div>
  );
}

/**
 * The counts and the venue names for the search, through the service role
 * (0014 revoked the venue columns from `authenticated`, and an admin is
 * `authenticated` too). Elevated only after the is_admin check above.
 */
async function ChromeWithCounts({ email, access }: { email: string; access: { isAdmin: boolean; roles: StaffRole[] } }) {
  const [counts, { data }] = await Promise.all([
    adminCounts(),
    createServiceClient().from("venues").select("id, name, is_active, areas(name)").order("name"),
  ]);
  const venues: PaletteVenue[] = ((data ?? []) as any[]).map((v) => ({
    id: v.id,
    name: v.name,
    area: v.areas?.name ?? null,
    active: v.is_active !== false,
  }));
  return <AdminChrome counts={counts} venues={venues} email={email} access={access} />;
}
