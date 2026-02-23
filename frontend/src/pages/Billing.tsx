import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Download, CreditCard, Loader2, MoreHorizontal, AlertCircle, RefreshCcw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import api from "@/lib/api"; 
import { toast } from "sonner";
import * as BillingService from "@/services/billing.service";
import { useAuth } from "@/contexts/AuthContext";
import { Subscription, Invoice } from "@/types/subscription";
import { ColumnDef, SortingState, PaginationState, ColumnFiltersState } from "@tanstack/react-table";
import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table";
import { BillingAlert } from "@/components/billing/BillingAlert";
import { getSubscriptionColumns, invoiceColumns, oneTimePurchaseColumns } from "@/components/billing/columns";
import { OneTimePurchase } from "@/types/subscription";

export default function Billing() {
  const navigate = useNavigate();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [oneTimePurchases, setOneTimePurchases] = useState<OneTimePurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);

  // Subscription State
  const [subSorting, setSubSorting] = useState<SortingState>([]);
  const [subPagination, setSubPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 5 });
  const [subStatusFilter, setSubStatusFilter] = useState<string>("all");

  // Invoice State
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [searchQuery, setSearchQuery] = useState("");

  const { activeOrganization } = useAuth();
  const [gracePeriodDays, setGracePeriodDays] = useState(3);

  useEffect(() => {
     api.get('/billing/config').then(res => {
         if (res.data.gracePeriodDays) setGracePeriodDays(res.data.gracePeriodDays);
     }).catch(err => console.error("Failed to fetch billing config", err));
  }, []);



  const fetchSubscription = useCallback(async () => {
    try {
      const response = await api.get(`/billing`);
      setSubscriptions(response.data.subscriptions);
      setOneTimePurchases(response.data.oneTimePurchases || []);
    } catch (error) {
      console.error("Failed to fetch subscription", error);
    }
  }, []);

  const fetchInvoices = useCallback(async () => {
    try {
      const response = await api.get(`/billing/invoices?limit=100`);
      setInvoices(response.data.invoices || []);
    } catch (error) {
      console.error("Failed to fetch invoices", error);
    }
  }, []);

  const handleCancelSubscription = useCallback(async (subId: string, stripeSubId: string) => {
    if (!confirm("Are you sure you want to cancel? Your subscription will remain active until the end of the billing period.")) return;
    setActionLoading(subId);
    try {
        await api.post(`/billing/subscription/${stripeSubId}/cancel`);
        toast.success("Subscription cancelled successfully");
        fetchSubscription();
    } catch (error) {
        console.error("Failed to cancel subscription", error);
        toast.error("Failed to cancel subscription");
    } finally {
        setActionLoading(null);
    }
  }, [fetchSubscription]);

  const handleResumeSubscription = useCallback(async (subId: string, stripeSubId: string) => {
    setActionLoading(subId);
    try {
        await api.post(`/billing/subscription/${stripeSubId}/resume`);
        toast.success("Subscription resumed successfully");
        fetchSubscription();
    } catch (error) {
        console.error("Failed to resume subscription", error);
        toast.error("Failed to resume subscription");
    } finally {
        setActionLoading(null);
    }
  }, [fetchSubscription]);

  const handleCancelTrial = useCallback(async (subId: string) => {
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
  }, [fetchSubscription]);

  const handleManageSubscription = useCallback(async () => {
    setPortalLoading(true);
    try {
      const response = await api.post(`/billing/portal-session`);
      if (response.data.url) {
        window.location.href = response.data.url;
      }
    } catch (error) {
      console.error("Failed to create portal session", error);
      toast.error("Failed to open billing portal");
    } finally {
      setPortalLoading(false);
    }
  }, []);



  const handleSyncSubscription = useCallback(async (manual = true) => {
    setSyncLoading(true);
    try {
        await api.post(`/billing/sync`);
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
  }, [fetchSubscription]);

  const handleCancelDowngrade = useCallback(async (subId: string) => {
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
  }, [fetchSubscription]);

  useEffect(() => {
    const init = async () => {
        const params = new URLSearchParams(window.location.search);
        const isSuccess = params.get('success') === 'true';

        // Clear the query param immediately to prevent double toasts in StrictMode
        if (isSuccess) {
            const newUrl = window.location.pathname;
            window.history.replaceState({}, '', newUrl);
        }
        
        // Sync status to handle potential race conditions
        await handleSyncSubscription(false);

        const invoicePromise = fetchInvoices();
        let subPromise;

        if (isSuccess) {
            subPromise = (async () => {
                 try {
                    // Re-fetch to ensure we have the absolute latest state after sync
                    const response = await api.get(`/billing`);
                    const subs = response.data.subscriptions;
                    setSubscriptions(subs);
                    setOneTimePurchases(response.data.oneTimePurchases || []);
                    
                    if (subs.length > 0) {
                        const latestSub = subs[0];
                        if (latestSub.status === 'canceled' && latestSub.cancellation_reason === 'duplicate_card') {
                            toast.error("Trial blocked: A subscription for this tool was already used with this card.", {
                                duration: 8000,
                            });
                        } else {
                             toast.success("Subscription updated successfully");
                        }
                    } else {
                        toast.success("Subscription updated successfully");
                    }
                 } catch (e) {
                     console.error("Failed to check subscription status", e);
                 }
            })();
        } else {
            // Already synced, resolve immediately
            subPromise = Promise.resolve(); 
        }

        await Promise.all([subPromise, invoicePromise]);
        setLoading(false);
    };
    
    if (activeOrganization) {
      init();
    }
  }, [activeOrganization, handleSyncSubscription, fetchInvoices]);

  // --- Subscriptions ---

  const subscriptionColumns = useMemo(() => getSubscriptionColumns({
      actionLoading,
      portalLoading,
      onManage: handleManageSubscription,
      onCancel: handleCancelSubscription,
      onResume: handleResumeSubscription,
      onCancelTrial: handleCancelTrial,
      onCancelDowngrade: handleCancelDowngrade,
      onNavigate: (path) => navigate(path)
  }), [actionLoading, portalLoading, navigate, handleManageSubscription, handleCancelSubscription, handleResumeSubscription, handleCancelTrial, handleCancelDowngrade]);

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

  // --- One Time Purchases ---
  const [otpSorting, setOtpSorting] = useState<SortingState>([]);
  const [otpPagination, setOtpPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 5 });

  const paginatedOtp = useMemo(() => {
    const start = otpPagination.pageIndex * otpPagination.pageSize;
    return oneTimePurchases.slice(start, start + otpPagination.pageSize);
  }, [oneTimePurchases, otpPagination]);

  const otpPageCount = Math.ceil(oneTimePurchases.length / otpPagination.pageSize);

  // --- Invoices ---
  
  // Use imported invoiceColumns
  const columns = invoiceColumns;

  // Client-side sorting/filtering for Invoices
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
            {/* Billing Actions */}
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

        {subscriptions.find(sub => sub.status === 'past_due') && (
            <BillingAlert
                subscription={subscriptions.find(s => s.status === 'past_due')}
                onManage={handleManageSubscription}
                onCancel={handleCancelSubscription}
                isLoading={portalLoading}
                actionLoading={actionLoading === subscriptions.find(s => s.status === 'past_due')?.id}
                gracePeriodDays={gracePeriodDays}
            />
        )}

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

        {/* One-Time Purchases */}
        {oneTimePurchases.length > 0 && (
            <Card className="mb-8">
                <CardHeader>
                    <CardTitle>One-Time Purchases</CardTitle>
                    <CardDescription>Your lifetime plans and bundles</CardDescription>
                </CardHeader>
                <CardContent>
                    <DataTable
                        columns={oneTimePurchaseColumns}
                        data={paginatedOtp}
                        pageCount={otpPageCount}
                        pagination={otpPagination}
                        onPaginationChange={setOtpPagination}
                        sorting={otpSorting}
                        onSortingChange={setOtpSorting}
                        isLoading={loading}
                        searchQuery=""
                        onSearchChange={() => {}}
                    />
                </CardContent>
            </Card>
        )}

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
