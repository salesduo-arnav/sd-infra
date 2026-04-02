import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function PermissionItemSkeleton() {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border">
      <Skeleton className="h-4 w-4 rounded-sm mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <Skeleton className="h-4 w-[120px] mb-1" />
        <Skeleton className="h-3 w-full" />
      </div>
    </div>
  );
}

function PermissionCategorySkeleton({ itemCount = 6 }: { itemCount?: number }) {
  return (
    <div>
      <Skeleton className="h-4 w-[100px] mb-3" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Array.from({ length: itemCount }).map((_, i) => (
          <PermissionItemSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

function RoleCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-[140px]" />
          <Skeleton className="h-9 w-[130px] rounded-md" />
        </div>
        <Skeleton className="h-4 w-[220px] mt-1" />
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-6">
          <PermissionCategorySkeleton itemCount={6} />
          <PermissionCategorySkeleton itemCount={3} />
        </div>
      </CardContent>
    </Card>
  );
}

export function AdminRBACSkeleton() {
  return (
    <div className="space-y-6">
      <RoleCardSkeleton />
      <RoleCardSkeleton />
    </div>
  );
}
