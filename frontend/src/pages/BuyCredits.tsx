import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Coins, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  AlacarteConfig,
  CreditPackOption,
  CreditWallet,
  checkoutAlacarte,
  checkoutCreditPack,
  getAlacarteConfig,
  getCreditWalletByTool,
  listCreditPacks,
} from '@/services/billing.credit.service';

function formatPrice(price: number, currency: string) {
  return `$${(price / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

export default function BuyCredits() {
  const { toolSlug } = useParams<{ toolSlug: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [wallet, setWallet] = useState<CreditWallet | null>(null);
  const [packs, setPacks] = useState<CreditPackOption[]>([]);
  const [alacarte, setAlacarte] = useState<AlacarteConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [alacarteAmount, setAlacarteAmount] = useState<string>('');

  useEffect(() => {
    if (!toolSlug) return;
    setLoading(true);
    Promise.all([
      getCreditWalletByTool(toolSlug),
      listCreditPacks(toolSlug),
      getAlacarteConfig(toolSlug),
    ])
      .then(([w, p, a]) => {
        setWallet(w);
        setPacks(p);
        setAlacarte(a);
      })
      .catch(() => toast({ title: 'Failed to load credit purchase options', variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, [toolSlug, toast]);

  const alacarteTotal = useMemo(() => {
    const n = Number(alacarteAmount);
    if (!alacarte?.enabled || !alacarte.price_per_credit || !Number.isFinite(n) || n <= 0) return 0;
    return n * alacarte.price_per_credit;
  }, [alacarteAmount, alacarte]);

  const buyPack = async (pack: CreditPackOption) => {
    setPending(pack.id);
    try {
      const res = await checkoutCreditPack(pack.id);
      window.location.href = res.url;
    } catch {
      toast({ title: 'Failed to start checkout', variant: 'destructive' });
      setPending(null);
    }
  };

  const buyAlacarte = async () => {
    if (!toolSlug || !alacarte?.enabled) return;
    const credits = Number(alacarteAmount);
    if (!Number.isInteger(credits) || credits <= 0) {
      toast({ title: 'Enter a positive credit amount', variant: 'destructive' });
      return;
    }
    if (alacarte.min_credits && credits < alacarte.min_credits) {
      toast({ title: `Minimum is ${alacarte.min_credits} credits`, variant: 'destructive' });
      return;
    }
    if (alacarte.max_credits && credits > alacarte.max_credits) {
      toast({ title: `Maximum is ${alacarte.max_credits} credits`, variant: 'destructive' });
      return;
    }
    setPending('alacarte');
    try {
      const res = await checkoutAlacarte(toolSlug, credits);
      window.location.href = res.url;
    } catch {
      toast({ title: 'Failed to start checkout', variant: 'destructive' });
      setPending(null);
    }
  };

  if (loading) {
    return (
      <div className="container py-8">
        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading...
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/billing')}>
          ← Back to billing
        </Button>
      </div>

      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">
              Buy credits {wallet?.tool_name ? `for ${wallet.tool_name}` : ''}
            </h1>
          </div>
          <p className="text-muted-foreground mt-2">
            Choose a pack below, or buy a custom amount. Credits never expire and stack with your plan
            credits.
          </p>
        </div>
        {wallet && (
          <Card className="min-w-[200px]">
            <CardContent className="p-4">
              <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Current balance
              </div>
              <div className="text-3xl font-bold tabular-nums">{wallet.total_available}</div>
              <div className="text-xs text-muted-foreground">
                {wallet.plan_available} plan · {wallet.purchased_available} purchased
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {packs.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Credit packs</CardTitle>
            <CardDescription>Fixed-size bundles at the best per-credit rates.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {packs.map((p) => (
              <div
                key={p.id}
                className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-4 transition-colors hover:border-primary"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      ~${(p.unit_price / 100).toFixed(3)} / credit
                    </div>
                  </div>
                  <Badge variant="outline" className="font-semibold">{p.credits}</Badge>
                </div>
                <div className="mt-2 flex items-end justify-between">
                  <div className="text-2xl font-bold tabular-nums">
                    {formatPrice(p.price, p.currency)}
                  </div>
                  <Button onClick={() => buyPack(p)} disabled={pending !== null}>
                    {pending === p.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Buy
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {alacarte?.enabled && alacarte.price_per_credit ? (
        <Card>
          <CardHeader>
            <CardTitle>Custom amount</CardTitle>
            <CardDescription>
              Buy any number of credits at ${(alacarte.price_per_credit / 100).toFixed(3)} each. Minimum{' '}
              {alacarte.min_credits ?? 1}
              {alacarte.max_credits ? `, maximum ${alacarte.max_credits}` : ''}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid max-w-md gap-1">
              <Label>How many credits?</Label>
              <Input
                type="number"
                min={alacarte.min_credits ?? 1}
                max={alacarte.max_credits ?? undefined}
                placeholder="e.g. 100"
                value={alacarteAmount}
                onChange={(e) => setAlacarteAmount(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border bg-muted/30 p-3">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-2xl font-bold tabular-nums">
                ${(alacarteTotal / 100).toFixed(2)} {(alacarte.currency || 'usd').toUpperCase()}
              </span>
            </div>
            <Button
              size="lg"
              disabled={pending !== null || alacarteTotal === 0}
              onClick={buyAlacarte}
              className="w-full"
            >
              {pending === 'alacarte' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Continue to checkout
            </Button>
          </CardContent>
        </Card>
      ) : packs.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No credit purchase options are configured for this tool yet.
        </p>
      ) : null}
    </div>
  );
}
