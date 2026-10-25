import { cache } from "react";
import { createClient, createServiceClient } from "./supabase/server";

/**
 * Staff logins with one job each (staff_roles, 0095).
 *
 * The admin was all or nothing (profiles.is_admin). Now a login can be given
 * one or more of these and nothing else; the database holds the line on every
 * write (0095's policies and triggers), and this decides which admin pages
 * and API routes a login may open at all.
 */
export { STAFF_ROLES, ROLE_LABEL, ROLE_BLURB, ROLE_HOME, STAFF_EMAIL_DOMAIN, staffEmail } from "./staffRoles";
export type { StaffRole } from "./staffRoles";
import { ROLE_HOME, STAFF_ROLES, type StaffRole } from "./staffRoles";

export interface AdminAccess {
  userId: string;
  email: string;
  isAdmin: boolean;
  roles: StaffRole[];
}

/** Who is asking and what they may do, once per request. Null when signed out or neither. */
export const adminAccess = cache(async (): Promise<AdminAccess | null> => {
  const {
    data: { user },
  } = await createClient().auth.getUser();
  if (!user) return null;
  const db = createServiceClient();
  const [{ data: profile }, { data: roles }] = await Promise.all([
    db.from("profiles").select("is_admin").eq("id", user.id).maybeSingle(),
    // Null before 0095: nobody is staff, and admins are unaffected.
    db.from("staff_roles").select("role").eq("user_id", user.id),
  ]);
  const isAdmin = Boolean((profile as { is_admin?: boolean } | null)?.is_admin);
  const list = ((roles ?? []) as { role: string }[])
    .map((r) => r.role)
    .filter((r): r is StaffRole => (STAFF_ROLES as readonly string[]).includes(r));
  if (!isAdmin && !list.length) return null;
  return { userId: user.id, email: user.email ?? "", isAdmin, roles: list };
});

/** Whether this access may use something open to `roles` (admins may use everything). */
export function allows(access: AdminAccess | null, roles: readonly StaffRole[] = []): boolean {
  if (!access) return false;
  return access.isAdmin || roles.some((r) => access.roles.includes(r));
}

/** Where a staff login lands: their first role's page. Admins land on Today. */
export function homeFor(access: AdminAccess): string {
  return access.isAdmin ? "/admin" : ROLE_HOME[access.roles[0]];
}
