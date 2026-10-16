/** Timetable shaped skeleton, so the page keeps its shape while the rows load. */
export default function Loading() {
  const rows = [44, 58, 44, 84, 44, 112, 44, 58];
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading">
      <section className="rounded-xl border-[1.5px] border-ink bg-card">
        <div className="flex h-11 items-center border-b-[1.5px] border-ink px-4">
          <div className="h-3 w-24 animate-pulse rounded bg-sand" />
        </div>
        {rows.map((h, i) => (
          <div key={i} style={{ height: h, animationDelay: `${i * 60}ms` }} className="grid animate-pulse grid-cols-[56px_minmax(0,1fr)_96px] items-start gap-0 border-b border-ink/10 py-2.5 last:border-b-0 sm:grid-cols-[84px_minmax(0,1fr)_170px]">
            <div className="mx-3 h-3.5 w-10 rounded bg-sand sm:mx-4" />
            <div className="flex h-full gap-3 pr-3">
              <div className="w-1 rounded-full bg-sand" />
              <div className="h-3.5 w-1/2 rounded bg-sand/70" />
            </div>
            <div className="h-5 w-20 rounded-full bg-sand/70" />
          </div>
        ))}
      </section>
      <section className="h-40 animate-pulse rounded-xl border-[1.5px] border-ink/30 bg-sand/30" />
    </div>
  );
}
