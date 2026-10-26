import { PageHeaderSkeleton, StatCardsSkeleton, TableSkeleton } from "@/components/ui/skeleton";

/**
 * Streamed while an authenticated route renders. One skeleton for the whole
 * app shell's content area: the sidebar, header and live updates stay put, so
 * only this region ever shows a placeholder.
 */
export default function AppLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <StatCardsSkeleton />
      <TableSkeleton />
    </div>
  );
}
