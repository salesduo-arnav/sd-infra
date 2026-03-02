import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function BillingSkeleton() {
  return (
    <div className="container py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <Skeleton className="h-10 w-[250px] mb-2" />
          <Skeleton className="h-5 w-[350px]" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-10 rounded-md" />
          <Skeleton className="h-10 w-[140px] rounded-md" />
        </div>
      </div>

      <Card className="mb-8">
        <CardHeader className="flex flex-row items-center justify-between pb-6">
          <div className="space-y-2">
            <Skeleton className="h-6 w-[200px]" />
            <Skeleton className="h-4 w-[250px]" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-[120px] hidden sm:inline-block" />
            <Skeleton className="h-10 w-[140px] rounded-md" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-12 w-full rounded-md" />
            <Skeleton className="h-16 w-full rounded-md" />
            <Skeleton className="h-16 w-full rounded-md" />
            <Skeleton className="h-16 w-full rounded-md" />
          </div>
        </CardContent>
      </Card>
      
      <Card className="mt-6">
        <CardHeader className="pb-6">
          <Skeleton className="h-6 w-[180px] mb-2" />
          <Skeleton className="h-4 w-[220px]" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-12 w-[300px] rounded-md mb-4" />
            <Skeleton className="h-12 w-full rounded-md" />
            <Skeleton className="h-16 w-full rounded-md" />
            <Skeleton className="h-16 w-full rounded-md" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
