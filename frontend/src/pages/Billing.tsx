import { useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download, CreditCard, Loader2 } from "lucide-react";
import axios from 'axios';
import { toast } from "sonner";

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';



export default function Billing() {
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);

  const [invoices, setInvoices] = useState<any[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchSubscription();
    fetchInvoices();
    fetchPaymentMethods();
  }, []);

  const fetchSubscription = async () => {
    try {
      const response = await axios.get(`${API_URL}/billing`, { withCredentials: true });
      setSubscriptions(response.data.subscriptions);
    } catch (error) {
      console.error("Failed to fetch subscription", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchInvoices = async () => {
    try {
      const response = await axios.get(`${API_URL}/billing/invoices`, { withCredentials: true });
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

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Active Subscriptions */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Current Subscriptions</CardTitle>
              <CardDescription>
                Your active plan details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {subscriptions && subscriptions.length > 0 ? (
                 <div className="space-y-4">
                     {subscriptions.map((sub: any) => (
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
              <CardDescription>
                Manage your payment details
              </CardDescription>
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
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Billing History</CardTitle>
              <CardDescription>
                Download your past invoices
              </CardDescription>
            </div>
            {/* 
            <Button variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" />
              Export All
            </Button> 
            */}
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Download</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.length > 0 ? (
                    invoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                        <TableCell className="font-medium">{invoice.number}</TableCell>
                        <TableCell>{new Date(invoice.created * 1000).toLocaleDateString()}</TableCell>
                        <TableCell>{(invoice.amount_due / 100).toLocaleString('en-US', { style: 'currency', currency: invoice.currency.toUpperCase() })}</TableCell>
                        <TableCell>
                        <Badge variant={invoice.status === 'paid' ? 'default' : 'secondary'}>{invoice.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                        {invoice.invoice_pdf && (
                            <Button variant="ghost" size="sm" asChild>
                                <a href={invoice.invoice_pdf} target="_blank" rel="noopener noreferrer">
                                    <Download className="h-4 w-4" />
                                </a>
                            </Button>
                        )}
                        </TableCell>
                    </TableRow>
                    ))
                ) : (
                    <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">No invoices found</TableCell>
                    </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
