import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTableColumnHeader } from "@/components/ui/data-table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertCircle, CreditCard, Download, Loader2, MoreHorizontal } from "lucide-react";

// Types for props needed by subscription columns
export interface SubscriptionColumnsProps {
  actionLoading: string | null;
  portalLoading: boolean;
  onManage: () => void;
  onCancel: (subId: string, stripeSubId: string) => void;
  onResume: (subId: string, stripeSubId: string) => void;
  onCancelTrial: (subId: string) => void;
  onCancelDowngrade: (subId: string) => void;
  onNavigate: (path: string) => void;
}

export const getSubscriptionColumns = ({
  actionLoading,
  portalLoading,
  onManage,
  onCancel,
  onResume,
  onCancelTrial,
  onCancelDowngrade,
  onNavigate
}: SubscriptionColumnsProps): ColumnDef<any>[] => [
    {
        accessorKey: "plan_details",
        header: "Plan / Bundle",
        cell: ({ row }) => {
            const sub = row.original;
            // Bundle Group Name takes precedence for bundles, Tool Name for plans
            const name = sub.bundle?.group?.name || sub.plan?.tool?.name || sub.plan?.name || sub.bundle?.name || "Unknown Plan";
            const tier = sub.plan?.is_trial_plan ? 'Free Trial' : (sub.bundle?.tier_label || sub.plan?.tier || (sub.plan?.price > 0 ? 'Paid' : 'Free'));
            
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
                <DropdownMenuItem onClick={onManage} disabled={portalLoading}>
                    Update Payment Method
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {hasPendingDowngrade && (
                    <DropdownMenuItem onClick={() => onCancelDowngrade(sub.id)} className="text-orange-600 focus:text-orange-600">
                        Cancel Scheduled Downgrade
                    </DropdownMenuItem>
                )}
                {isCanceling && !(sub.status === 'trialing' && sub.plan?.price === 0) ? (
                    <DropdownMenuItem onClick={() => onResume(sub.id, sub.stripe_subscription_id)}>
                        Resume Subscription
                    </DropdownMenuItem>
                ) : sub.status === 'canceled' ? (
                    <DropdownMenuItem onClick={() => onNavigate('/plans')}>
                        Resubscribe
                    </DropdownMenuItem>
                ) : sub.status === 'trialing' ? (
                    <DropdownMenuItem onClick={() => onCancelTrial(sub.id)} className="text-destructive focus:text-destructive">
                        End Trial Immediately
                    </DropdownMenuItem>
                ) : (
                    <DropdownMenuItem onClick={() => onCancel(sub.id, sub.stripe_subscription_id)} className="text-destructive focus:text-destructive">
                        Cancel Subscription
                    </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
  ];

export const invoiceColumns: ColumnDef<any>[] = [
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
  ];
