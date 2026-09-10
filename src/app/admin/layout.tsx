import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/Logo";
import { AdminNav } from "@/components/admin/AdminNav";
import { adminCounts } from "@/lib/adminCounts";

export const dynamic = "force-dynamic";

/** /admin, gated by profiles.is_admin; dark sidenav layout as designed. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/admin");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_admin) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col items-center justify-center px-9 text-center">
        <div className="vic h-14 w-14 rounded-bar text-[24px]">🔒</div>
        <h1 className="mt-6 font-display text-[28px] font-bold">Admins only</h1>
        <p className="mt-3 text-body text-mutedbrown">
          Your account isn&apos;t flagged as an admin. Set <code>is_admin = true</code> on your
          profile row in Supabase to get in.
        </p>
        <Link href="/" className="btn2 btnsm mt-6 px-6">
          Back home
        </Link>
      </main>
    );
  }

  // Read once here and handed down, so the badges cost one query per page
  // load rather than one per link.
  const counts = await adminCounts(supabase);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col gap-0.5 bg-lagoon py-6 md:min-h-screen md:w-[220px]">
        <div className="flex items-baseline gap-2 px-6 pb-5">
          <Logo size={22} dark href="/" />
          <span className="text-[12px] text-lagoon-soft">admin</span>
        </div>
        <AdminNav counts={counts} />
      </aside>
      <div className="flex-1 px-5 py-7 md:px-8">{children}</div>
    </div>
  );
}
