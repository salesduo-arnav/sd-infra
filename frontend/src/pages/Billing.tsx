import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Download, CreditCard, Loader2, MoreHorizontal, AlertCircle, RefreshCcw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import axios from 'axios';
import { toast } from "sonner";
import * as BillingService from "@/services/billing.service";
import { ColumnDef, SortingState, PaginationState, ColumnFiltersState } from "@tanstack/react-table";
import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table";

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function Billing() {
  const navigate = useNavigate();
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);

  const [invoices, setInvoices] = useState<any[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);

  // Subscription Table State
  const [subSorting, setSubSorting] = useState<SortingState>([]);
  const [subPagination, setSubPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 5 });
  const [subStatusFilter, setSubStatusFilter] = useState<string>("all");

  // Invoice Table State
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const init = async () => {
        const params = new URLSearchParams(window.location.search);
        
        const invoicePromise = fetchInvoices();
        let subPromise;

        if (params.get('success') === 'true') {
            subPromise = (async () => {
                 try {
                    const response = await axios.get(`${API_URL}/billing`, { withCredentials: true });
                    const subs = response.data.subscriptions;
                    setSubscriptions(subs);
                    
                    if (subs.length > 0) {
                        const latestSub = subs[0];
                        if (latestSub.status === 'canceled' && latestSub.cancellation_reason === 'duplicate_card') {
                            toast.error("Trial blocked: A trial for this tool has already been redeemed with this card.", {
                                duration: 8000,
                            });
                        } else {
                             toast.success("Subscription updated successfully");
                        }
                    }
                 } catch (e) {
                     console.error("Failed to check subscription status", e);
                 }
            })();
        } else {
            subPromise = fetchSubscription();
        }

        await Promise.all([subPromise, invoicePromise]);
        setLoading(false);
    };
    
    init();
  }, []);

  const fetchSubscription = async () => {
    try {
      const response = await axios.get(`${API_URL}/billing`, { withCredentials: true });
      setSubscriptions(response.data.subscriptions);
    } catch (error) {
      console.error("Failed to fetch subscription", error);
    }
  };

  const fetchInvoices = async () => {
    try {
      const response = await axios.get(`${API_URL}/billing/invoices?limit=100`, { withCredentials: true });
      setInvoices(response.data.invoices || []);
    } catch (error) {
      console.error("Failed to fetch invoices", error);
    }
  };

  const handleCancelSubscription = async (subId: string, stripeSubId: string) => {
    if (!confirm("Are you sure you want to cancel? Your subscription will remain active until the end of the billing period.")) return;
    setActionLoading(subId);
    try {
        await axios.post(`${API_URL}/billing/subscription/${stripeSubId}/cancel`, {}, { withCredentials: true });
        toast.success("Subscription cancelled successfully");
        fetchSubscription();
    } catch (error) {
        console.error("Failed to cancel subscription", error);
        toast.error("Failed to cancel subscription");
    } finally {
        setActionLoading(null);
    }
  };

  const handleResumeSubscription = async (subId: string, stripeSubId: string) => {
    setActionLoading(subId);
    try {
        await axios.post(`${API_URL}/billing/subscription/${stripeSubId}/resume`, {}, { withCredentials: true });
        toast.success("Subscription resumed successfully");
        fetchSubscription();
    } catch (error) {
        console.error("Failed to resume subscription", error);
        toast.error("Failed to resume subscription");
    } finally {
        setActionLoading(null);
    }
  };

  const handleCancelTrial = async (subId: string) => {
    if (!confirm("Are you sure you want to end your trial immediately? You will lose access to paid features.")) return;
    setActionLoading(subId);
    try {
        await BillingService.cancelTrial(subId);
        toast.success("Trial cancelled successfully");
        fetchSubscription();
    } catch (error) {
        console.error("Failed to cancel trial", error);
        toast.error("Failed to cancel trial");
    } finally {
        setActionLoading(null);
    }
  };

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      const response = await axios.post(`${API_URL}/billing/portal-session`, {}, { withCredentials: true });
      if (response.data.url) {
        window.location.href = response.data.url;
      }
    } catch (error) {
      console.error("Failed to create portal session", error);
      toast.error("Failed to open billing portal");
    } finally {
      setPortalLoading(false);
    }
  };

  useEffect(() => {
    // Auto-sync on mount (silent)
    handleSyncSubscription(false);
  }, []);

  const handleSyncSubscription = async (manual = true) => {
    setSyncLoading(true);
    try {
        await axios.post(`${API_URL}/billing/sync`, {}, { withCredentials: true });
        if (manual) {
            toast.success("Subscription status synced with Stripe");
        }
        await fetchSubscription();
    } catch (error) {
        console.error("Failed to sync subscription", error);
        if (manual) {
            toast.error("Failed to sync subscription status");
        }
    } finally {
        setSyncLoading(false);
    }
  };

  const handleCancelDowngrade = async (subId: string) => {
    if (!confirm("Are you sure you want to cancel the scheduled downgrade? Your current plan will continue.")) return;
    setActionLoading(subId);
    try {
        await BillingService.cancelDowngrade(subId);
        toast.success("Scheduled downgrade cancelled successfully");
        fetchSubscription();
    } catch (error) {
        console.error("Failed to cancel downgrade", error);
        toast.error("Failed to cancel scheduled downgrade");
    } finally {
        setActionLoading(null);
    }
  };

  // --- Subscriptions Table Logic ---

  const subscriptionColumns = useMemo<ColumnDef<any>[]>(() => [
    {
        accessorKey: "plan_details",
        header: "Plan / Bundle",
        cell: ({ row }) => {
            const sub = row.original;
            // Bundle Group Name takes precedence for bundles, Tool Name for plans
            const name = sub.bundle?.group?.name || sub.plan?.tool?.name || sub.plan?.name || sub.bundle?.name || "Unknown Plan";
            const tier = sub.bundle?.tier_label || sub.plan?.tier || (sub.plan?.price > 0 ? 'Paid' : 'Free');
            
            const upcomingName = sub.upcoming_bundle?.group?.name || sub.upcoming_plan?.tool?.name || sub.upcoming_plan?.name || sub.upcoming_bundle?.name;
            const upcomingTier = sub.upcoming_bundle?.tier_label || sub.upcoming_plan?.tier;
            const renewDate = sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : '';

            return (
                <div>
                    <div className="font-medium">{name}</div>
                    <div className="text-xs text-muted-foreground capitalize">{tier} Tier</div>
                    {(upcomingName || upcomingTier) && (
                        <div className="mt-1 text-xs text-orange-600 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            <span>Switches to {upcomingName || 'plan'} ({upcomingTier} Tier) on {renewDate}</span>
                        </div>
                    )}
                </div>
            )
        }
    },
    {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
            const status = row.original.status;
            return (
                <Badge variant={status === 'active' ? 'default' : status === 'trialing' ? 'outline' : 'secondary'} className="capitalize">
                    {status === 'trialing' ? 'Trial Active' : status}
                </Badge>
            )
        }
    },
    {
        accessorKey: "current_period_end",
        header: "Renews / Expires",
        cell: ({ row }) => {
             const date = row.original.current_period_end ? new Date(row.original.current_period_end).toLocaleDateString() : 'N/A';
             const isCanceling = row.original.cancel_at_period_end;
             const isCanceled = row.original.status === 'canceled';
             const isTrialing = row.original.status === 'trialing';
             
             let label = 'Renews on';
             if (isCanceled) label = 'Expired on';
             else if (isCanceling) label = 'Expires on';
             else if (isTrialing) label = 'Trial Ends on';

             return (
                 <div className="flex flex-col">
                     <span className="text-sm">{date}</span>
                     <span className="text-xs text-muted-foreground">{label}</span>
                 </div>
             )
        }
    },
    {
        accessorKey: "payment_method",
        header: "Payment Method",
        cell: ({ row }) => {
            const pm = row.original.paymentMethodDetails;
            if (!pm) return <span className="text-muted-foreground text-sm">-</span>;
            return (
                <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm capitalize">{pm.brand} •••• {pm.last4}</span>
                </div>
            )
        }
    },
    {
        id: "actions",
        enableHiding: false,
        cell: ({ row }) => {
          const sub = row.original;
          const isCanceling = sub.cancel_at_period_end;
          const hasPendingDowngrade = !!(sub.upcoming_plan_id || sub.upcoming_bundle_id);
          const isLoading = actionLoading === sub.id;

          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0" disabled={isLoading}>
                  <span className="sr-only">Open menu</span>
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem onClick={handleManageSubscription} disabled={portalLoading}>
                    Update Payment Method
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {hasPendingDowngrade && (
                    <DropdownMenuItem onClick={() => handleCancelDowngrade(sub.id)} className="text-orange-600 focus:text-orange-600">
                        Cancel Scheduled Downgrade
                    </DropdownMenuItem>
                )}
                {isCanceling && !(sub.status === 'trialing' && sub.plan?.price === 0) ? (
                    <DropdownMenuItem onClick={() => handleResumeSubscription(sub.id, sub.stripe_subscription_id)}>
                        Resume Subscription
                    </DropdownMenuItem>
                ) : sub.status === 'canceled' ? (
                    <DropdownMenuItem onClick={() => navigate('/plans')}>
                        Resubscribe
                    </DropdownMenuItem>
                ) : sub.status === 'trialing' ? (
                    <DropdownMenuItem onClick={() => handleCancelTrial(sub.id)} className="text-destructive focus:text-destructive">
                        End Trial Immediately
                    </DropdownMenuItem>
                ) : (
                    <DropdownMenuItem onClick={() => handleCancelSubscription(sub.id, sub.stripe_subscription_id)} className="text-destructive focus:text-destructive">
                        Cancel Subscription
                    </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
  ], [actionLoading, portalLoading]);

  const filteredSubscriptions = useMemo(() => {
    let result = [...subscriptions];
    if (subStatusFilter && subStatusFilter !== 'all') {
        result = result.filter(sub => sub.status === subStatusFilter);
    }
    return result;
  }, [subscriptions, subStatusFilter]);

  const paginatedSubscriptions = useMemo(() => {
    const start = subPagination.pageIndex * subPagination.pageSize;
    return filteredSubscriptions.slice(start, start + subPagination.pageSize);
  }, [filteredSubscriptions, subPagination]);

  const subPageCount = Math.ceil(filteredSubscriptions.length / subPagination.pageSize);


  // --- Invoices Table Logic ---

  // Columns for the invoices table
  const columns = useMemo<ColumnDef<any>[]>(() => [
    {
      accessorKey: "number",
      header: "Invoice",
      cell: ({ row }) => <span className="font-medium">{row.original.number}</span>,
    },
    {
      accessorKey: "created",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Date" />
      ),
      cell: ({ row }) => new Date(row.original.created * 1000).toLocaleDateString(),
    },
    {
      accessorKey: "amount_due",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Amount" />
      ),
      cell: ({ row }) => (row.original.amount_due / 100).toLocaleString('en-US', { style: 'currency', currency: row.original.currency.toUpperCase() }),
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => (
        <Badge variant={row.original.status === 'paid' ? 'default' : 'secondary'}>{row.original.status}</Badge>
      ),
    },
    {
      id: "actions",
      header: ({ column }) => (
        <div className="text-right">Download</div>
      ),
      cell: ({ row }) => {
        return row.original.invoice_pdf ? (
             <div className="text-right">
                <Button variant="ghost" size="sm" asChild>
                    <a href={row.original.invoice_pdf} target="_blank" rel="noopener noreferrer">
                        <Download className="h-4 w-4" />
                    </a>
                </Button>
            </div>
        ) : null;
      },
    },
  ], []);

  // Client-side sorting and simple search for Invoices
  const filteredAndSortedInvoices = useMemo(() => {
    let result = [...invoices];

    if (searchQuery) {
        const lowerQuery = searchQuery.toLowerCase();
        result = result.filter(inv => 
            inv.number?.toLowerCase().includes(lowerQuery) || 
            inv.status?.toLowerCase().includes(lowerQuery)
        );
    }

    if (sorting.length > 0) {
        const { id, desc } = sorting[0];
        result.sort((a, b) => {
            let aValue = a[id];
            let bValue = b[id];
            
            // Handle specific column types if needed
            if (id === 'amount_due' || id === 'created') {
                aValue = Number(aValue);
                bValue = Number(bValue);
            } else {
                aValue = String(aValue).toLowerCase();
                bValue = String(bValue).toLowerCase();
            }

            if (aValue < bValue) return desc ? 1 : -1;
            if (aValue > bValue) return desc ? -1 : 1;
            return 0;
        });
    }

    return result;
  }, [invoices, sorting, searchQuery]);

  const paginatedInvoices = useMemo(() => {
    const start = pagination.pageIndex * pagination.pageSize;
    return filteredAndSortedInvoices.slice(start, start + pagination.pageSize);
  }, [filteredAndSortedInvoices, pagination]);

  const pageCount = Math.ceil(filteredAndSortedInvoices.length / pagination.pageSize);

  if (loading) {
     return (
        <Layout>
            <div className="flex h-[50vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        </Layout>
     )
  }

  return (
    <Layout>
      <div className="container py-8">
        <div className="mb-8 flex items-center justify-between">
            <div>
                <h1 className="text-3xl font-bold">Billing & Invoices</h1>
                <p className="mt-2 text-muted-foreground">
                    Manage your subscriptions and view billing history
                </p>
            </div>
            {/* Main Manage Subscription button (Portal) as a fallback or general setting */}
            <div className="flex gap-2">
                <Button onClick={() => handleSyncSubscription(true)} disabled={syncLoading} variant="outline" size="icon" title="Sync Status">
                     <RefreshCcw className={`h-4 w-4 ${syncLoading ? 'animate-spin' : ''}`} />
                </Button>
                <Button onClick={handleManageSubscription} disabled={portalLoading} variant="outline">
                    {portalLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Billing Portal
                </Button>
            </div>
        </div>

        {subscriptions.find(sub => sub.status === 'past_due') && (() => {
            const sub = subscriptions.find(s => s.status === 'past_due');
            const failureDate = sub.last_payment_failure_at ? new Date(sub.last_payment_failure_at) : new Date(); 
            const threeDaysInMillis = 7 * 24 * 60 * 60 * 1000;
            const isGracePeriod = (new Date().getTime() - failureDate.getTime()) < threeDaysInMillis;

            if (isGracePeriod) {
                return (
                    <Alert variant="destructive" className="mb-6 border-destructive/50 bg-destructive/10 text-destructive dark:border-destructive/50">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Payment Failed</AlertTitle>
                        <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <span className="text-foreground">
                                Your last payment for subscription of <strong>{sub.plan?.name || sub.bundle?.name || "Unknown Plan"}</strong> failed. 
                                Please try again or cancel your subscription.
                            </span>
                            <div className="flex gap-2 mt-2 sm:mt-0">
                                <Button 
                                    variant="default"
                                    size="sm" 
                                    onClick={handleManageSubscription} 
                                    disabled={portalLoading}
                                >
                                    {portalLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    Try Again
                                </Button>
                                <Button 
                                    variant="destructive" 
                                    size="sm" 
                                    onClick={() => handleCancelSubscription(sub.id, sub.stripe_subscription_id)} 
                                    disabled={actionLoading === sub.id}
                                >
                                    {actionLoading === sub.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    Cancel Subscription
                                </Button>
                            </div>
                        </AlertDescription>
                    </Alert>
                )
            }
            return null;
        })()}

        <Card className="mb-8">
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>Your Subscriptions</CardTitle>
                    <CardDescription>Manage your active plans and bundles</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                     <span className="text-sm text-muted-foreground hidden sm:inline-block">Filter by status:</span>
                     <Select value={subStatusFilter} onValueChange={setSubStatusFilter}>
                        <SelectTrigger className="w-[140px]">
                            <SelectValue placeholder="Filter" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="trialing">Trialing</SelectItem>
                            <SelectItem value="past_due">Past Due</SelectItem>
                            <SelectItem value="canceled">Canceled</SelectItem>
                            <SelectItem value="all">All</SelectItem>
                        </SelectContent>
                     </Select>
                </div>
            </CardHeader>
            <CardContent>
                <DataTable
                    columns={subscriptionColumns}
                    data={paginatedSubscriptions}
                    pageCount={subPageCount}
                    pagination={subPagination}
                    onPaginationChange={setSubPagination}
                    sorting={subSorting}
                    onSortingChange={setSubSorting}
                    isLoading={loading}
                    searchQuery=""
                    onSearchChange={() => {}}
                />
            </CardContent>
        </Card>

        {/* Billing History */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Billing History</CardTitle>
            <CardDescription>Download your past invoices</CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
                columns={columns}
                data={paginatedInvoices}
                pageCount={pageCount}
                pagination={pagination}
                onPaginationChange={setPagination}
                sorting={sorting}
                onSortingChange={setSorting}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                placeholder="Search invoices..."
                isLoading={loading}
            />
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
