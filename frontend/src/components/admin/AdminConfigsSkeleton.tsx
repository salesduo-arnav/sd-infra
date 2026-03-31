import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function ConfigRowSkeleton({ inputWidth = "w-full" }: { inputWidth?: string }) {
  return (
    <div className="flex flex-col gap-4 p-6 border-b last:border-0">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="space-y-1.5 flex-1">
          <Skeleton className="h-5 w-[160px]" />
          <Skeleton className="h-4 w-[280px]" />
        </div>
        <Skeleton className="h-9 w-9 rounded-md shrink-0" />
      </div>
      <Skeleton className={`h-10 ${inputWidth}`} />
    </div>
  );
}

export function AdminConfigsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Card 1 — 3 config rows */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-[140px]" />
          <Skeleton className="h-4 w-[300px]" />
        </CardHeader>
        <CardContent className="p-0">
          <ConfigRowSkeleton inputWidth="max-w-2xl" />
          <ConfigRowSkeleton inputWidth="w-40" />
          <ConfigRowSkeleton inputWidth="max-w-2xl" />
        </CardContent>
      </Card>

      {/* Card 2 — 2 config rows */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-[180px]" />
          <Skeleton className="h-4 w-[260px]" />
        </CardHeader>
        <CardContent className="p-0">
          <ConfigRowSkeleton inputWidth="max-w-xs" />
          <ConfigRowSkeleton inputWidth="max-w-2xl" />
        </CardContent>
      </Card>

      {/* Card 3 — 3 config rows */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-[200px]" />
          <Skeleton className="h-4 w-[340px]" />
        </CardHeader>
        <CardContent className="p-0">
          <ConfigRowSkeleton inputWidth="max-w-2xl" />
          <ConfigRowSkeleton inputWidth="max-w-xs" />
          <ConfigRowSkeleton inputWidth="max-w-2xl" />
        </CardContent>
      </Card>
    </div>
  );
}
