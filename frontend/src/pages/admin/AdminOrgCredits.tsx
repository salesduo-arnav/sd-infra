import { useEffect, useMemo, useState } from 'react';
import { Coins, Loader2, InfinityIcon, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  CreditBucket,
  LedgerEntry,
  OrgWallet,
  OrgWalletSummary,
  UsageSummary,
  adjustOrgWallet,
  getOrgCreditWallets,
  getOrgWalletLedger,
  getOrgWalletUsage,
  listOrgsWithWallets,
} from '@/services/admin.credit.service';
import { format } from 'date-fns';

export default function AdminOrgCredits() {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [orgs, setOrgs] = useState<OrgWalletSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrg, setSelectedOrg] = useState<OrgWalletSummary | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await listOrgsWithWallets(search.trim() || undefined);
      setOrgs(data);
    } catch {
      toast({ title: 'Failed to load orgs', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">Org Credits</h1>
          </div>
          <p className="text-muted-foreground mt-2">
            View and edit credit wallets, ledger history and operation usage per organization.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div className="flex flex-1 items-center gap-2">
            <Input
              placeholder="Search org name or slug…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load()}
              className="max-w-md"
            />
            <Button variant="outline" onClick={load}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead className="text-right">Wallets</TableHead>
                  <TableHead className="text-right">Total credits</TableHead>
                  <TableHead className="w-[120px] text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading...
                    </TableCell>
                  </TableRow>
                ) : orgs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      No organizations match.
                    </TableCell>
                  </TableRow>
                ) : (
                  orgs.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell>{o.name}</TableCell>
                      <TableCell>
                        <span className="font-mono text-xs">{o.slug}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{o.wallet_count}</TableCell>
                      <TableCell className="text-right">
                        <div className="text-lg font-semibold tabular-nums">
                          {o.total_credits.toLocaleString()}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {o.plan_total} plan · {o.purchased_total} purchased
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => setSelectedOrg(o)}>
                          Manage
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <OrgCreditDrawer
        org={selectedOrg}
        onClose={() => setSelectedOrg(null)}
        onChanged={load}
      />
    </div>
  );
}

function OrgCreditDrawer({
  org,
  onClose,
  onChanged,
}: {
  org: OrgWalletSummary | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [wallets, setWallets] = useState<OrgWallet[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);

  const reload = async () => {
    if (!org) return;
    setLoading(true);
    try {
      const w = await getOrgCreditWallets(org.id);
      setWallets(w);
      if (w.length && !activeTool) setActiveTool(w[0].tool_id);
    } catch {
      toast({ title: 'Failed to load wallets', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (org) {
      setActiveTool(null);
      reload();
    } else {
      setWallets([]);
      setActiveTool(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org?.id]);

  return (
    <Sheet open={!!org} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{org?.name}</SheetTitle>
          <SheetDescription>
            <span className="font-mono text-xs">{org?.slug}</span>
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="py-10 text-center text-muted-foreground">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading...
          </div>
        ) : !org ? null : (
          <Tabs defaultValue="wallets" className="mt-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="wallets">Wallets</TabsTrigger>
              <TabsTrigger value="ledger">Ledger</TabsTrigger>
              <TabsTrigger value="usage">Usage</TabsTrigger>
              <TabsTrigger value="adjust">Adjust</TabsTrigger>
            </TabsList>

            <TabsContent value="wallets" className="space-y-3 pt-4">
              {wallets.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No wallets yet.</p>
              ) : (
                wallets.map((w) => (
                  <div key={w.wallet_id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold">{w.tool_name}</div>
                        <div className="font-mono text-xs text-muted-foreground">{w.tool_slug}</div>
                      </div>
                      <Badge variant="default">
                        {w.total_available} available
                      </Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Plan
                        </div>
                        <div className="text-lg font-semibold tabular-nums">{w.plan_balance}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Purchased
                        </div>
                        <div className="text-lg font-semibold tabular-nums">{w.purchased_balance}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Held
                        </div>
                        <div className="text-lg font-semibold tabular-nums">{w.reserved_amount}</div>
                      </div>
                    </div>
                    <div className="mt-2 text-[11px] text-muted-foreground">
                      {w.plan_period_end ? (
                        <>plan resets {format(new Date(w.plan_period_end), 'PP')}</>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <InfinityIcon className="h-3 w-3" /> no expiry set
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="ledger" className="pt-4">
              <LedgerView orgId={org.id} wallets={wallets} activeTool={activeTool} onTool={setActiveTool} />
            </TabsContent>

            <TabsContent value="usage" className="pt-4">
              <UsageView orgId={org.id} wallets={wallets} activeTool={activeTool} onTool={setActiveTool} />
            </TabsContent>

            <TabsContent value="adjust" className="pt-4">
              <AdjustForm
                orgId={org.id}
                wallets={wallets}
                onAdjusted={async () => {
                  await reload();
                  onChanged();
                }}
              />
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}

function LedgerView({
  orgId,
  wallets,
  activeTool,
  onTool,
}: {
  orgId: string;
  wallets: OrgWallet[];
  activeTool: string | null;
  onTool: (id: string) => void;
}) {
  const { toast } = useToast();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeTool) return;
    setLoading(true);
    getOrgWalletLedger(orgId, activeTool)
      .then((r) => setEntries(r.entries))
      .catch(() => toast({ title: 'Failed to load ledger', variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, [orgId, activeTool, toast]);

  if (wallets.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No wallets yet.</p>;
  }

  return (
    <div className="space-y-3">
      <Select value={activeTool ?? ''} onValueChange={onTool}>
        <SelectTrigger>
          <SelectValue placeholder="Select tool" />
        </SelectTrigger>
        <SelectContent>
          {wallets.map((w) => (
            <SelectItem key={w.tool_id} value={w.tool_id}>
              {w.tool_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="max-h-[500px] space-y-1 overflow-y-auto">
        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading...
          </p>
        ) : entries.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No ledger activity.</p>
        ) : (
          entries.map((e) => (
            <div key={e.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
              <Badge variant="outline" className="font-mono text-[10px] uppercase">
                {e.entry_type}
              </Badge>
              <span
                className={`font-semibold tabular-nums ${
                  e.amount >= 0 ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {e.amount >= 0 ? `+${e.amount}` : e.amount}
              </span>
              <span className="text-xs text-muted-foreground capitalize">{e.bucket}</span>
              {e.operation_slug && (
                <span className="font-mono text-[10px] text-muted-foreground">{e.operation_slug}</span>
              )}
              <span className="ml-auto text-[11px] text-muted-foreground">
                {format(new Date(e.created_at), 'PP p')}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function UsageView({
  orgId,
  wallets,
  activeTool,
  onTool,
}: {
  orgId: string;
  wallets: OrgWallet[];
  activeTool: string | null;
  onTool: (id: string) => void;
}) {
  const { toast } = useToast();
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(30);

  useEffect(() => {
    if (!activeTool) return;
    setLoading(true);
    getOrgWalletUsage(orgId, activeTool, days)
      .then(setUsage)
      .catch(() => toast({ title: 'Failed to load usage', variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, [orgId, activeTool, days, toast]);

  if (wallets.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No wallets yet.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Select value={activeTool ?? ''} onValueChange={onTool}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Select tool" />
          </SelectTrigger>
          <SelectContent>
            {wallets.map((w) => (
              <SelectItem key={w.tool_id} value={w.tool_id}>
                {w.tool_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="365">Last 365 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading...
        </p>
      ) : !usage || usage.operations.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No usage in the last {days} days.
        </p>
      ) : (
        <div className="space-y-1">
          {usage.operations.map((op) => (
            <div
              key={op.operation_slug}
              className="flex items-center gap-2 rounded-md border p-2 text-sm"
            >
              <span className="font-mono text-xs">{op.operation_slug}</span>
              <span className="ml-auto font-semibold tabular-nums">{op.spent} credits</span>
              <span className="text-xs text-muted-foreground">({op.runs} runs)</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AdjustForm({
  orgId,
  wallets,
  onAdjusted,
}: {
  orgId: string;
  wallets: OrgWallet[];
  onAdjusted: () => void;
}) {
  const { toast } = useToast();
  const [toolId, setToolId] = useState('');
  const [bucket, setBucket] = useState<CreditBucket>('plan');
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!toolId) {
      toast({ title: 'Select a tool', variant: 'destructive' });
      return;
    }
    const d = Number(delta);
    if (!Number.isInteger(d) || d === 0) {
      toast({ title: 'Delta must be a non-zero integer', variant: 'destructive' });
      return;
    }
    if (!reason.trim()) {
      toast({ title: 'Reason is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await adjustOrgWallet(orgId, toolId, { bucket, delta: d, reason });
      toast({ title: 'Wallet adjusted' });
      setDelta('');
      setReason('');
      onAdjusted();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast({ title: msg || 'Adjustment failed', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const tools = useMemo(
    () =>
      wallets.length > 0
        ? wallets.map((w) => ({ id: w.tool_id, name: w.tool_name || w.tool_slug || w.tool_id }))
        : [],
    [wallets],
  );

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Tool</Label>
        <Select value={toolId} onValueChange={setToolId}>
          <SelectTrigger>
            <SelectValue placeholder="Select tool" />
          </SelectTrigger>
          <SelectContent>
            {tools.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label>Bucket</Label>
        <Select value={bucket} onValueChange={(v: CreditBucket) => setBucket(v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="plan">Plan (expires at period end)</SelectItem>
            <SelectItem value="purchased">Purchased (never expires)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label>Delta (positive = grant, negative = revoke)</Label>
        <Input
          type="number"
          placeholder="e.g. 50 or -25"
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
        />
      </div>

      <div className="space-y-1">
        <Label>Reason</Label>
        <Input
          placeholder="Why are you adjusting this wallet?"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>

      <Button onClick={submit} disabled={saving} className="w-full">
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Apply adjustment
      </Button>
    </div>
  );
}
