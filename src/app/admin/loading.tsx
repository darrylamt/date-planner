/**
 * Shown the moment a link is clicked, while the page is fetched: the shape of
 * a page rather than the last one standing still.
 */
export default function AdminLoading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="adm-skel h-8 w-56" />
      <div className="adm-skel mt-3 h-4 w-80 max-w-full" />
      <div className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="adm-skel h-[92px] rounded-[14px]" />
        ))}
      </div>
      <div className="card mt-6 overflow-hidden p-0">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-line px-4 py-3.5 last:border-0">
            <div className="adm-skel h-4 flex-1" style={{ maxWidth: `${60 - (i % 3) * 12}%` }} />
            <div className="adm-skel h-4 w-20" />
            <div className="adm-skel h-4 w-14" />
          </div>
        ))}
      </div>
    </div>
  );
}
