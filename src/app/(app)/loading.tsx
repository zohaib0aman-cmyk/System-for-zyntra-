import { LeadListSkeleton } from "@/components/Skeletons";

export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-12 animate-pulse rounded-xl bg-slate-200" />
      <LeadListSkeleton />
    </div>
  );
}
