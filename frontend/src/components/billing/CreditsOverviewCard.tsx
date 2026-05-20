import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Coins, InfinityIcon, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CreditWallet, getCreditWallets } from '@/services/billing.credit.service';
import { format } from 'date-fns';

export default function CreditsOverviewCard() {
  const [wallets, setWallets] = useState<CreditWallet[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getCreditWallets();
        if (!cancelled) setWallets(data);
      } catch {
        if (!cancelled) setWallets([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Coins className="h-5 w-5 text-primary" /> Your Credits
        </CardTitle>
        <CardDescription>
          Credits power generation flows (Quick Flow, regen, image edit, etc.). Plan credits refresh on
          each billing cycle; purchased credits never expire.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : !wallets || wallets.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No credit wallet yet. Subscribe to a plan or purchase a credit pack from the billing page to
            get started.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {wallets.map((w) => (
              <div key={w.wallet_id} className="space-y-3 rounded-lg border bg-muted/30 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{w.tool_name}</div>
                    {w.tool_slug && w.tool_slug !== w.tool_name && (
                      <div className="font-mono text-xs text-muted-foreground">{w.tool_slug}</div>
                    )}
                  </div>
                  <Badge>{w.total_available} available</Badge>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Plan
                    </div>
                    <div className="text-lg font-semibold tabular-nums">{w.plan_available}</div>
                    <div className="text-xs text-muted-foreground">
                      {w.plan_period_end ? (
                        <>resets {format(new Date(w.plan_period_end), 'PP')}</>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <InfinityIcon className="h-3 w-3" /> no expiry set
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Purchased
                    </div>
                    <div className="text-lg font-semibold tabular-nums">
                      {w.purchased_available}
                    </div>
                    <div className="text-xs text-muted-foreground">never expires</div>
                  </div>
                </div>
                {(w.reserved_amount ?? 0) > 0 && (
                  <div className="text-[11px] text-muted-foreground">
                    {w.reserved_amount} held in active flows
                  </div>
                )}
                <div className="flex justify-end">
                  <Button asChild size="sm" variant="ghost">
                    <Link to={`/billing/credits/${w.tool_slug}`}>Buy more</Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Re-export Loader2 to keep tree-shaking simple if needed externally
export { Loader2 };
