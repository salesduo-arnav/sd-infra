import { useState, useEffect, useMemo } from "react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Download, CreditCard, Loader2, ChevronLeft, ChevronRight, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import axios from 'axios';
import { toast } from "sonner";
import { ColumnDef, SortingState, PaginationState } from "@tanstack/react-table";
import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table";

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function Billing() {
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);

  const [invoices, setInvoices] = useState<any[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Subscription Pagination
  const [subPageIndex, setSubPageIndex] = useState(0);
  const SUBSCRIPTIONS_PER_PAGE = 5;

  const paginatedSubscriptions = useMemo(() => {
    const start = subPageIndex * SUBSCRIPTIONS_PER_PAGE;
    return subscriptions.slice(start, start + SUBSCRIPTIONS_PER_PAGE);
  }, [subscriptions, subPageIndex]);

  const totalSubPages = Math.ceil(subscriptions.length / SUBSCRIPTIONS_PER_PAGE);

  // DataTable state
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const fetchData = async () => {
        await Promise.all([fetchSubscription(), fetchInvoices(), fetchPaymentMethods()]);
        setLoading(false);
    };
    fetchData();
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

  const fetchPaymentMethods = async () => {
    try {
      const response = await axios.get(`${API_URL}/billing/payment-methods`, { withCredentials: true });
      setPaymentMethods(response.data.paymentMethods || []);
    } catch (error) {
      console.error("Failed to fetch payment methods", error);
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

  // Client-side sorting and simple search
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

  // Client-side pagination
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
            <Button onClick={handleManageSubscription} disabled={portalLoading}>
                {portalLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Manage Subscription
            </Button>
        </div>

        {subscriptions.find(sub => sub.status === 'past_due') && (() => {
            const sub = subscriptions.find(s => s.status === 'past_due');
            // Check for grace period (3 days)
            // If last_payment_failure_at is null, assume we show it (or handling legacy)
            // But requirement says "during that grace period of 3 days"
            const failureDate = sub.last_payment_failure_at ? new Date(sub.last_payment_failure_at) : new Date(); // fallback if missing
            const threeDaysInMillis = 3 * 24 * 60 * 60 * 1000;
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
                                    variant="default" // Changed to default for better visibility in alert
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

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Active Subscriptions */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Current Subscriptions</CardTitle>
              <CardDescription>Your active plan details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {subscriptions && subscriptions.length > 0 ? (
                 <div className="flex min-h-[550px] flex-col">
                     <div className="space-y-4">
                         {paginatedSubscriptions.map((sub: any) => (
                         <div key={sub.id} className="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <div className="flex items-center gap-2">
                                <span className="text-lg font-semibold">
                                    {sub.plan?.name || sub.bundle?.name || "Unknown Plan"}
                                </span>
                                <Badge variant={sub.status === 'active' ? 'default' : 'secondary'} className="capitalize">{sub.status}</Badge>
                                {sub.cancel_at_period_end && <Badge variant="destructive">Cancels at end</Badge>}
                                </div>
                                <p className="mt-1 text-sm text-muted-foreground">
                                {sub.status === 'active' && !sub.cancel_at_period_end ? 'Renews' : 'Expires'} on {sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : 'N/A'}
                                </p>
                            </div>
                            <div className="flex gap-2">
                                {sub.cancel_at_period_end ? (
                                    <Button variant="outline" size="sm" onClick={() => handleResumeSubscription(sub.id, sub.stripe_subscription_id)} disabled={actionLoading === sub.id}>
                                        {actionLoading === sub.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                        Resume Subscription
                                    </Button>
                                ) : (
                                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleCancelSubscription(sub.id, sub.stripe_subscription_id)} disabled={actionLoading === sub.id}>
                                        {actionLoading === sub.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                        Cancel Subscription
                                    </Button>
                                )}
                            </div>
                        </div>
                     ))}
                     </div>
                     
                     {subscriptions.length > SUBSCRIPTIONS_PER_PAGE && (
                        <div className="mt-auto flex items-center justify-end space-x-2 pt-4">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSubPageIndex((prev) => Math.max(prev - 1, 0))}
                                disabled={subPageIndex === 0}
                            >
                                <ChevronLeft className="h-4 w-4 mr-1" />
                                Previous
                            </Button>
                            <div className="text-sm font-medium">
                                Page {subPageIndex + 1} of {totalSubPages}
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSubPageIndex((prev) => Math.min(prev + 1, totalSubPages - 1))}
                                disabled={subPageIndex >= totalSubPages - 1}
                            >
                                Next
                                <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                        </div>
                     )}
                 </div>
              ) : (
                <div className="text-center py-8">
                    <p className="text-muted-foreground">No active subscription found.</p>
                    <Button variant="link" onClick={() => window.location.href='/plans'}>View Plans</Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payment Method */}
          <Card>
            <CardHeader>
              <CardTitle>Payment Method</CardTitle>
              <CardDescription>Manage your payment details</CardDescription>
            </CardHeader>
             <CardContent>
               {paymentMethods.length > 0 ? (
                   paymentMethods.map((pm: any) => (
                    <div key={pm.id} className="mb-4 flex items-center gap-3 rounded-lg border p-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary">
                        <CreditCard className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                        <p className="text-sm font-medium capitalize">{pm.card.brand} •••• {pm.card.last4}</p>
                        <p className="text-xs text-muted-foreground">
                            Expires {pm.card.exp_month}/{pm.card.exp_year}
                        </p>
                        </div>
                    </div>
                   ))
               ) : (
                   <p className="mb-4 text-sm text-muted-foreground">No payment methods found.</p>
               )}
               
               <Button variant="outline" className="w-full" onClick={handleManageSubscription} disabled={portalLoading}>
                 Manage Payment Methods (Portal)
               </Button>
             </CardContent>
          </Card>
        </div>

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
