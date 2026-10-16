export default function Loading() {
  return (
    <div className="animate-pulse space-y-6 pt-2" aria-busy="true" aria-label="Loading">
      <div className="h-3 w-24 rounded bg-tomato/30" />
      <div className="h-10 w-2/3 rounded-lg bg-sand" />
      <div className="h-[1.5px] bg-ink/20" />
      <div className="grid grid-cols-4 gap-6">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-16 rounded-lg bg-sand/70" />)}
      </div>
      {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-12 rounded-lg bg-sand/50" />)}
    </div>
  );
}
