import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, Loader2 } from "lucide-react";

interface BillingAlertProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  subscription: any;
  onManage: () => void;
  onCancel: (subId: string, stripeSubId: string) => void;
  isLoading: boolean;
  actionLoading: boolean;
  gracePeriodDays: number;
}

export function BillingAlert({ subscription, onManage, onCancel, isLoading, actionLoading, gracePeriodDays }: BillingAlertProps) {
  const failureDate = subscription.last_payment_failure_at ? new Date(subscription.last_payment_failure_at) : new Date(); 
  // Grace period
  const gracePeriodInMillis = gracePeriodDays * 24 * 60 * 60 * 1000;
  const isGracePeriod = (new Date().getTime() - failureDate.getTime()) < gracePeriodInMillis;

  if (!isGracePeriod) return null;

  return (
    <Alert variant="destructive" className="mb-6 border-destructive/50 bg-destructive/10 text-destructive dark:border-destructive/50">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Payment Failed</AlertTitle>
        <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-foreground">
                Your last payment for subscription of <strong>{subscription.plan?.name || subscription.bundle?.name || "Unknown Plan"}</strong> failed. 
                Please try again or cancel your subscription.
            </span>
            <div className="flex gap-2 mt-2 sm:mt-0">
                <Button 
                    variant="default"
                    size="sm" 
                    onClick={onManage} 
                    disabled={isLoading}
                >
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Try Again
                </Button>
                <Button 
                    variant="destructive" 
                    size="sm" 
                    onClick={() => onCancel(subscription.id, subscription.stripe_subscription_id)} 
                    disabled={actionLoading}
                >
                    {actionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Cancel Subscription
                </Button>
            </div>
        </AlertDescription>
    </Alert>
  );
}
