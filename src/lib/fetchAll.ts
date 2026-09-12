/**
 * Read every row, not the first thousand.
 *
 * PostgREST caps an unbounded select. On this project the cap is 1,000, which
 * was invisible while menu_items held 588 rows and became wrong the moment it
 * passed a thousand: the catalogue now holds 2,306, so a plain select returned
 * the first 1,000 and every screen that counted menu items was quietly reading
 * a third of the data. Bistro 22 has 156 dishes and the admin table showed 0,
 * because its rows sat past the cut.
 *
 * The failure mode is the dangerous kind. No error, no warning, no gap in the
 * page, just numbers that are confidently too low, which is exactly the sort
 * of thing this catalogue is supposed not to do.
 *
 * So: page explicitly. The caller supplies a function that builds the query
 * for a given window, because a Supabase query builder cannot be re-run with a
 * different range once awaited.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000
): Promise<T[]> {
  const out: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw error;

    const batch = data ?? [];
    out.push(...batch);

    /*
     * A short page means the end. A full one might be the end exactly on the
     * boundary, in which case the next request returns nothing and the loop
     * stops one round later, which costs one empty query and never a missing
     * row.
     */
    if (batch.length < pageSize) break;

    // A catalogue this size cannot legitimately need more than this, and an
    // unbounded loop against a paging bug would hammer the database.
    if (out.length > 500_000) break;
  }

  return out;
}
