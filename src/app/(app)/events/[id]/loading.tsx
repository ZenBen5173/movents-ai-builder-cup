export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading">
      <div className="grid grid-cols-4 gap-6">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-16 rounded-lg bg-sand/70" />)}
      </div>
      {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-11 rounded-lg bg-sand/50" />)}
    </div>
  );
}
