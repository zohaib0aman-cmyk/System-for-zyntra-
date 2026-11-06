export function LeadListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <ul className="grid gap-2.5 sm:grid-cols-2" aria-busy="true" aria-label="Loading leads">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="card flex animate-pulse items-center gap-3 p-3">
          <div className="h-12 w-12 rounded-xl bg-slate-200" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-2/3 rounded bg-slate-200" />
            <div className="h-3 w-1/3 rounded bg-slate-200" />
            <div className="h-3 w-1/2 rounded bg-slate-100" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="card animate-pulse overflow-hidden" aria-busy="true">
      <div className="h-28 bg-slate-200" />
      <div className="space-y-3 p-5">
        <div className="h-6 w-1/2 rounded bg-slate-200" />
        <div className="h-4 w-1/3 rounded bg-slate-200" />
        <div className="h-24 rounded bg-slate-100" />
      </div>
    </div>
  );
}
