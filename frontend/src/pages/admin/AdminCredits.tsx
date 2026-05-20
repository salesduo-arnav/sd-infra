import { useEffect, useMemo, useState } from 'react';
import { Coins, Pencil, Trash2, Plus, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { getTools, getPlans, Tool, Plan } from '@/services/admin.service';
import {
  CreditPack,
  FeatureCost,
  PlanCreditGrant,
  ToolCreditConfig,
  createCreditPack,
  deleteCreditPack,
  deletePlanCreditGrant,
  getToolCreditConfig,
  listAllPlanCreditGrants,
  listCreditPacks,
  listFeatureCreditCosts,
  updateCreditPack,
  updateFeatureCreditCost,
  upsertPlanCreditGrant,
  upsertToolCreditConfig,
} from '@/services/admin.credit.service';

const RESET_INTERVALS = ['monthly', 'yearly', 'never'] as const;
const ON_CANCEL_LABELS: Record<string, string> = {
  forfeit_immediate: 'Forfeit immediately',
  keep_till_period_end: 'Keep till period end',
  keep_forever: 'Keep forever',
};

function formatPrice(price: number, currency: string) {
  return `${(price / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

export default function AdminCredits() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Credits Administration</h1>
        <p className="text-muted-foreground mt-2">
          Configure per-operation credit costs, plan credit grants, and one-time credit packs.
        </p>
      </div>

      <Tabs defaultValue="costs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="costs">Feature Costs</TabsTrigger>
          <TabsTrigger value="grants">Plan Grants</TabsTrigger>
          <TabsTrigger value="packs">Credit Packs</TabsTrigger>
          <TabsTrigger value="alacarte">A-la-carte</TabsTrigger>
        </TabsList>

        <TabsContent value="costs">
          <FeatureCostsTab />
        </TabsContent>
        <TabsContent value="grants">
          <PlanGrantsTab />
        </TabsContent>
        <TabsContent value="packs">
          <CreditPacksTab />
        </TabsContent>
        <TabsContent value="alacarte">
          <AlacarteTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ==========================
// Tab 1 — Feature Costs
// ==========================

function FeatureCostsTab() {
  const { toast } = useToast();
  const [features, setFeatures] = useState<FeatureCost[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [toolFilter, setToolFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [feats, toolsRes] = await Promise.all([listFeatureCreditCosts(), getTools({ limit: 100 })]);
      setFeatures(feats);
      setTools(toolsRes.tools || []);
    } catch (e) {
      toast({ title: 'Failed to load feature costs', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (toolFilter === 'all') return features;
    return features.filter((f) => f.tool_id === toolFilter);
  }, [features, toolFilter]);

  const saveCost = async (id: string) => {
    const cost = Number(editValue);
    if (!Number.isInteger(cost) || cost < 0) {
      toast({ title: 'Cost must be a non-negative integer', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await updateFeatureCreditCost(id, { credit_cost: cost });
      toast({ title: 'Feature cost updated' });
      setEditingId(null);
      await load();
    } catch {
      toast({ title: 'Update failed', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggleUseCreditSystem = async (f: FeatureCost, next: boolean) => {
    try {
      await updateFeatureCreditCost(f.id, { use_credit_system: next });
      toast({
        title: next
          ? `${f.name} now uses the credit system`
          : `${f.name} now uses plan entitlements`,
      });
      await load();
    } catch {
      toast({ title: 'Update failed', variant: 'destructive' });
    }
  };

  const toggleRequiresSubscription = async (f: FeatureCost, next: boolean) => {
    try {
      await updateFeatureCreditCost(f.id, { requires_subscription: next });
      toast({
        title: next
          ? `${f.name} now requires an active subscription`
          : `${f.name} is now available to credit-only users`,
      });
      await load();
    } catch {
      toast({ title: 'Update failed', variant: 'destructive' });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Feature Costs</CardTitle>
          <CardDescription>How many credits each chargeable operation costs.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Select value={toolFilter} onValueChange={setToolFilter}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Filter by tool" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tools</SelectItem>
              {tools.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="ml-auto text-sm text-muted-foreground">{filtered.length} total</span>
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tool</TableHead>
                <TableHead>Operation slug</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-center w-[170px]">Use Credit System</TableHead>
                <TableHead className="text-center w-[180px]">Requires Subscription</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="w-[60px] text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    No features yet.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {f.tool?.name || '—'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs">{f.slug}</span>
                    </TableCell>
                    <TableCell>{f.name}</TableCell>
                    <TableCell className="text-center">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex">
                              <Switch
                                checked={!!f.use_credit_system}
                                onCheckedChange={(v) => toggleUseCreditSystem(f, v)}
                                aria-label="Use credit system"
                              />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs space-y-1.5">
                            <p>
                              When <b>ON</b>, this feature is metered via credits — the cost
                              below is charged per invocation.
                            </p>
                            <p>
                              When <b>OFF</b>, the feature uses the existing plan entitlement
                              flow: availability and limits come from the plan, and the feature
                              appears locked / disabled in the tool UI when the plan doesn't
                              allow it.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell className="text-center">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex">
                              <Switch
                                checked={!!f.requires_subscription}
                                disabled={!f.use_credit_system}
                                onCheckedChange={(v) => toggleRequiresSubscription(f, v)}
                                aria-label="Requires subscription"
                              />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs space-y-1.5">
                            {!f.use_credit_system ? (
                              <p>
                                Only applies when "Use Credit System" is ON. With credits OFF,
                                plan entitlements already gate access.
                              </p>
                            ) : (
                              <>
                                <p>
                                  When <b>ON</b>, the user's plan must include this feature
                                  (boolean check — the per-plan numeric limit is ignored).
                                  Credits are then spent on top of that gate.
                                </p>
                                <p>
                                  When <b>OFF</b>, any user with credits can use this feature —
                                  including credit-only users with no active subscription.
                                </p>
                              </>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell className="text-right">
                      {editingId === f.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <Input
                            type="number"
                            min={0}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="h-8 w-24 text-right"
                          />
                          <Button size="sm" disabled={saving} onClick={() => saveCost(f.id)}>
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <span
                          className={cn(
                            'font-semibold tabular-nums',
                            !f.use_credit_system && 'text-muted-foreground/60',
                          )}
                        >
                          {f.credit_cost}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {editingId !== f.id && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  disabled={!f.use_credit_system}
                                  onClick={() => {
                                    setEditingId(f.id);
                                    setEditValue(String(f.credit_cost));
                                  }}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </span>
                            </TooltipTrigger>
                            {!f.use_credit_system && (
                              <TooltipContent>
                                Enable "Use Credit System" to set a cost.
                              </TooltipContent>
                            )}
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ==========================
// Tab 2 — Plan Grants
// ==========================

interface PlanGrantDialogState {
  open: boolean;
  planId: string;
  toolId: string;
  credits_per_cycle: string;
  trial_credits: string;
  reset_interval: 'monthly' | 'yearly' | 'never';
  carry_over: boolean;
  on_cancel: 'forfeit_immediate' | 'keep_till_period_end' | 'keep_forever';
  isEdit: boolean;
}

const EMPTY_GRANT_STATE: PlanGrantDialogState = {
  open: false,
  planId: '',
  toolId: '',
  credits_per_cycle: '0',
  trial_credits: '0',
  reset_interval: 'monthly',
  carry_over: true,
  on_cancel: 'keep_till_period_end',
  isEdit: false,
};

function PlanGrantsTab() {
  const { toast } = useToast();
  const [grants, setGrants] = useState<PlanCreditGrant[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<PlanGrantDialogState>(EMPTY_GRANT_STATE);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [g, p, t] = await Promise.all([
        listAllPlanCreditGrants(),
        getPlans(undefined, { limit: 200 }),
        getTools({ limit: 100 }),
      ]);
      setGrants(g);
      setPlans(p.plans || []);
      setTools(t.tools || []);
    } catch {
      toast({ title: 'Failed to load grants', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const openCreate = () =>
    setDialog({ ...EMPTY_GRANT_STATE, open: true, isEdit: false });
  const openEdit = (g: PlanCreditGrant) =>
    setDialog({
      open: true,
      planId: g.plan_id,
      toolId: g.tool_id,
      credits_per_cycle: String(g.credits_per_cycle),
      trial_credits: String(g.trial_credits),
      reset_interval: g.reset_interval,
      carry_over: g.carry_over,
      on_cancel: g.on_cancel,
      isEdit: true,
    });

  const save = async () => {
    if (!dialog.planId || !dialog.toolId) {
      toast({ title: 'Plan and tool are required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await upsertPlanCreditGrant(dialog.planId, dialog.toolId, {
        credits_per_cycle: Number(dialog.credits_per_cycle) || 0,
        trial_credits: Number(dialog.trial_credits) || 0,
        reset_interval: dialog.reset_interval,
        carry_over: dialog.carry_over,
        on_cancel: dialog.on_cancel,
      });
      toast({ title: dialog.isEdit ? 'Grant updated' : 'Grant created' });
      setDialog(EMPTY_GRANT_STATE);
      await load();
    } catch {
      toast({ title: 'Save failed', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (g: PlanCreditGrant) => {
    if (!window.confirm('Delete this grant? Active subscribers keep credits already granted.')) return;
    try {
      await deletePlanCreditGrant(g.plan_id, g.tool_id);
      toast({ title: 'Grant deleted' });
      await load();
    } catch {
      toast({ title: 'Delete failed', variant: 'destructive' });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Plan Grants</CardTitle>
          <CardDescription>How many credits each plan grants per period.</CardDescription>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> Add grant
        </Button>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead>Tool</TableHead>
                <TableHead className="text-right">Credits/cycle</TableHead>
                <TableHead className="text-right">Trial</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Carry over</TableHead>
                <TableHead>On cancel</TableHead>
                <TableHead className="w-[100px] text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading...
                  </TableCell>
                </TableRow>
              ) : grants.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    No plan credit grants configured yet.
                  </TableCell>
                </TableRow>
              ) : (
                grants.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell>{g.plan?.name || '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {g.tool?.name || '—'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {g.credits_per_cycle}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {g.trial_credits > 0 ? g.trial_credits : '—'}
                    </TableCell>
                    <TableCell className="capitalize">{g.reset_interval}</TableCell>
                    <TableCell>
                      {g.carry_over ? <Badge>Yes</Badge> : <Badge variant="secondary">No</Badge>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {ON_CANCEL_LABELS[g.on_cancel]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(g)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(g)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={dialog.open} onOpenChange={(o) => !o && setDialog(EMPTY_GRANT_STATE)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog.isEdit ? 'Edit plan credit grant' : 'Add plan credit grant'}</DialogTitle>
            <DialogDescription>
              Plan + tool make up the unique key. Choose how many credits this plan grants and how unused
              credits are handled on cancellation.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Plan</Label>
                <Select
                  value={dialog.planId}
                  onValueChange={(v) => setDialog((d) => ({ ...d, planId: v }))}
                  disabled={dialog.isEdit}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} ({p.tier})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Tool</Label>
                <Select
                  value={dialog.toolId}
                  onValueChange={(v) => setDialog((d) => ({ ...d, toolId: v }))}
                  disabled={dialog.isEdit}
                >
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
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Credits per cycle</Label>
                <Input
                  type="number"
                  min={0}
                  value={dialog.credits_per_cycle}
                  onChange={(e) =>
                    setDialog((d) => ({ ...d, credits_per_cycle: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Trial credits (expires at trial_end)</Label>
                <Input
                  type="number"
                  min={0}
                  value={dialog.trial_credits}
                  onChange={(e) => setDialog((d) => ({ ...d, trial_credits: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Reset interval</Label>
                <Select
                  value={dialog.reset_interval}
                  onValueChange={(v: (typeof RESET_INTERVALS)[number]) =>
                    setDialog((d) => ({ ...d, reset_interval: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RESET_INTERVALS.map((r) => (
                      <SelectItem key={r} value={r} className="capitalize">
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3 pt-7">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={dialog.reset_interval === 'never' ? false : dialog.carry_over}
                          disabled={dialog.reset_interval === 'never'}
                          onCheckedChange={(v) =>
                            setDialog((d) => ({ ...d, carry_over: v }))
                          }
                        />
                        <Label
                          className={
                            dialog.reset_interval === 'never'
                              ? 'cursor-not-allowed text-muted-foreground'
                              : 'cursor-pointer'
                          }
                        >
                          Carry unused credits to next cycle
                        </Label>
                      </div>
                    </TooltipTrigger>
                    {dialog.reset_interval === 'never' && (
                      <TooltipContent className="max-w-xs">
                        Carry-over only applies when credits reset on a cycle. With "never", the
                        plan grants credits once on subscribe and never refreshes — there is no
                        next cycle for unused credits to roll into.
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
            <div className="space-y-1">
              <Label>On cancellation</Label>
              <Select
                value={dialog.on_cancel}
                onValueChange={(v) =>
                  setDialog((d) => ({
                    ...d,
                    on_cancel: v as PlanGrantDialogState['on_cancel'],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="forfeit_immediate">Forfeit immediately</SelectItem>
                  <SelectItem value="keep_till_period_end">Keep till period end</SelectItem>
                  <SelectItem value="keep_forever">Keep forever (convert to purchased)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(EMPTY_GRANT_STATE)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save grant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ==========================
// Tab 3 — Credit Packs
// ==========================

interface PackDialogState {
  open: boolean;
  id?: string;
  tool_id: string;
  name: string;
  credits: string;
  price: string;
  currency: string;
  active: boolean;
}

const EMPTY_PACK_STATE: PackDialogState = {
  open: false,
  tool_id: '',
  name: '',
  credits: '',
  price: '',
  currency: 'usd',
  active: true,
};

function CreditPacksTab() {
  const { toast } = useToast();
  const [packs, setPacks] = useState<CreditPack[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<PackDialogState>(EMPTY_PACK_STATE);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [p, t] = await Promise.all([listCreditPacks(), getTools({ limit: 100 })]);
      setPacks(p);
      setTools(t.tools || []);
    } catch {
      toast({ title: 'Failed to load credit packs', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const openCreate = () => setDialog({ ...EMPTY_PACK_STATE, open: true });
  const openEdit = (pack: CreditPack) =>
    setDialog({
      open: true,
      id: pack.id,
      tool_id: pack.tool_id,
      name: pack.name,
      credits: String(pack.credits),
      price: String(pack.price),
      currency: pack.currency,
      active: pack.active,
    });

  const save = async () => {
    if (!dialog.tool_id || !dialog.name || !dialog.credits || !dialog.price) {
      toast({ title: 'All fields required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      if (dialog.id) {
        await updateCreditPack(dialog.id, {
          name: dialog.name,
          credits: Number(dialog.credits),
          price: Number(dialog.price),
          currency: dialog.currency,
          active: dialog.active,
        });
      } else {
        await createCreditPack({
          tool_id: dialog.tool_id,
          name: dialog.name,
          credits: Number(dialog.credits),
          price: Number(dialog.price),
          currency: dialog.currency,
          active: dialog.active,
        });
      }
      toast({ title: dialog.id ? 'Credit pack updated' : 'Credit pack created' });
      setDialog(EMPTY_PACK_STATE);
      await load();
    } catch {
      toast({ title: 'Save failed', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (pack: CreditPack) => {
    if (!window.confirm('Delete this credit pack? The Stripe price will be archived.')) return;
    try {
      await deleteCreditPack(pack.id);
      toast({ title: 'Pack deleted' });
      await load();
    } catch {
      toast({ title: 'Delete failed', variant: 'destructive' });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Credit Packs</CardTitle>
          <CardDescription>One-time credit purchases listed in the user billing UI.</CardDescription>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> Add pack
        </Button>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tool</TableHead>
                <TableHead>Pack name</TableHead>
                <TableHead className="text-right">Credits</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Stripe price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px] text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading...
                  </TableCell>
                </TableRow>
              ) : packs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    No credit packs yet.
                  </TableCell>
                </TableRow>
              ) : (
                packs.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {p.tool?.name || '—'}
                      </Badge>
                    </TableCell>
                    <TableCell>{p.name}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{p.credits}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPrice(p.price, p.currency)}
                    </TableCell>
                    <TableCell>
                      {p.stripe_price_id ? (
                        <Badge variant="secondary" className="font-mono text-xs">
                          {p.stripe_price_id.slice(0, 14)}…
                        </Badge>
                      ) : (
                        <Badge variant="destructive">missing</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {p.active ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(p)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={dialog.open} onOpenChange={(o) => !o && setDialog(EMPTY_PACK_STATE)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog.id ? 'Edit credit pack' : 'Add credit pack'}</DialogTitle>
            <DialogDescription>
              Saving a new pack provisions a Stripe Product + Price automatically. Updating the price
              archives the old Stripe price and creates a new one (Stripe prices are immutable).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1">
              <Label>Tool</Label>
              <Select
                value={dialog.tool_id}
                onValueChange={(v) => setDialog((d) => ({ ...d, tool_id: v }))}
                disabled={!!dialog.id}
              >
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
              <Label>Pack name</Label>
              <Input
                placeholder="e.g. 100-credit pack"
                value={dialog.name}
                onChange={(e) => setDialog((d) => ({ ...d, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Credits</Label>
                <Input
                  type="number"
                  min={1}
                  value={dialog.credits}
                  onChange={(e) => setDialog((d) => ({ ...d, credits: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Price (cents)</Label>
                <Input
                  type="number"
                  min={0}
                  value={dialog.price}
                  onChange={(e) => setDialog((d) => ({ ...d, price: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Currency</Label>
                <Input
                  value={dialog.currency}
                  onChange={(e) => setDialog((d) => ({ ...d, currency: e.target.value.toLowerCase() }))}
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={dialog.active}
                onCheckedChange={(v) => setDialog((d) => ({ ...d, active: v }))}
              />
              <Label className="cursor-pointer">Active (visible in billing UI)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(EMPTY_PACK_STATE)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save pack
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ==========================
// Tab 4 — A-la-carte
// ==========================

function AlacarteTab() {
  const { toast } = useToast();
  const [tools, setTools] = useState<Tool[]>([]);
  const [selectedTool, setSelectedTool] = useState<string>('');
  const [config, setConfig] = useState<ToolCreditConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    alacarte_enabled: false,
    price_per_credit: '',
    currency: 'usd',
    min_credits: '1',
    max_credits: '',
  });

  useEffect(() => {
    getTools({ limit: 100 }).then((r) => setTools(r.tools || []));
  }, []);

  useEffect(() => {
    if (!selectedTool) {
      setConfig(null);
      return;
    }
    setLoading(true);
    getToolCreditConfig(selectedTool)
      .then((c) => {
        setConfig(c);
        setForm({
          alacarte_enabled: c.alacarte_enabled,
          price_per_credit: c.price_per_credit ? String(c.price_per_credit) : '',
          currency: c.currency,
          min_credits: String(c.min_credits),
          max_credits: c.max_credits ? String(c.max_credits) : '',
        });
      })
      .catch(() => toast({ title: 'Failed to load tool config', variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, [selectedTool, toast]);

  const save = async () => {
    if (!selectedTool) return;
    if (form.alacarte_enabled && (!form.price_per_credit || Number(form.price_per_credit) <= 0)) {
      toast({ title: 'Set price per credit before enabling', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const next = await upsertToolCreditConfig(selectedTool, {
        alacarte_enabled: form.alacarte_enabled,
        price_per_credit: form.price_per_credit ? Number(form.price_per_credit) : null,
        currency: form.currency,
        min_credits: form.min_credits ? Number(form.min_credits) : 1,
        max_credits: form.max_credits ? Number(form.max_credits) : null,
      });
      setConfig(next);
      toast({ title: 'A-la-carte config saved' });
    } catch {
      toast({ title: 'Save failed', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>A-la-carte credit pricing</CardTitle>
        <CardDescription>
          Let users buy any amount of credits for a tool at a fixed per-credit price.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label>Tool</Label>
          <Select value={selectedTool} onValueChange={setSelectedTool}>
            <SelectTrigger className="max-w-md">
              <SelectValue placeholder="Pick a tool" />
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

        {loading ? (
          <div className="py-6 text-muted-foreground">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading...
          </div>
        ) : selectedTool ? (
          <div className="space-y-4 rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <Switch
                checked={form.alacarte_enabled}
                onCheckedChange={(v) => setForm((f) => ({ ...f, alacarte_enabled: v }))}
              />
              <Label className="cursor-pointer">Enable a-la-carte purchases</Label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Price per credit (cents)</Label>
                <Input
                  type="number"
                  min={0}
                  placeholder="e.g. 10 = $0.10/credit"
                  value={form.price_per_credit}
                  onChange={(e) => setForm((f) => ({ ...f, price_per_credit: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Currency</Label>
                <Input
                  value={form.currency}
                  onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toLowerCase() }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Min credits</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.min_credits}
                  onChange={(e) => setForm((f) => ({ ...f, min_credits: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Max credits (optional)</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.max_credits}
                  onChange={(e) => setForm((f) => ({ ...f, max_credits: e.target.value }))}
                />
              </div>
            </div>
            {config?.alacarte_stripe_price_id && (
              <p className="text-xs text-muted-foreground">
                Current Stripe price:{' '}
                <span className="font-mono">{config.alacarte_stripe_price_id}</span> — changing the
                price archives this and creates a new one.
              </p>
            )}
            <div className="flex justify-end">
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Coins className="mr-2 h-4 w-4" />
                Save config
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            Select a tool to configure a-la-carte credit pricing.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
