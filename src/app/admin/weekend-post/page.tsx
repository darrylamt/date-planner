import { redirect } from "next/navigation";

/** The weekend post moved into Admin → Social (15 Nov 2026). */
export default function WeekendPostPage() {
  redirect("/admin/social");
}
