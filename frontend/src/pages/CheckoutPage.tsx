import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Check, ShieldCheck } from 'lucide-react';
import axios from 'axios';
import { API_URL } from '@/lib/api';
import { loadStripe } from '@stripe/stripe-js';
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout
} from '@stripe/react-stripe-js';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

// Initialize Stripe outside component to avoid recreation
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');

export default function CheckoutPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  
  const planId = searchParams.get('planId');
  const bundleId = searchParams.get('bundleId');
  const interval = searchParams.get('interval') || 'monthly';
  
  // Items from navigation state (Cart)
  const cartItems = location.state?.items;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  useEffect(() => {
    if ((!planId && !bundleId && (!cartItems || cartItems.length === 0))) {
      setError('No items selected for checkout');
      return;
    }
    
    // Auto-initialize checkout session
    initializeCheckout();
  }, [planId, bundleId, cartItems]);

  const initializeCheckout = async () => {
    setLoading(true);
    setError(null);
    try {
      // Construct items array
      let items = [];
      if (cartItems && cartItems.length > 0) {
          items = cartItems;
      } else if (planId) {
          items = [{ id: planId, type: 'plan', interval }];
      } else if (bundleId) {
          items = [{ id: bundleId, type: 'bundle', interval }];
      }

      const response = await axios.post(`${API_URL}/billing/checkout-session`, {
        items,
        ui_mode: 'embedded'
      }, {
        withCredentials: true
      });

      if (response.data.clientSecret) {
        setClientSecret(response.data.clientSecret);
      } else {
         setError('Failed to initialize checkout session');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.message || 'An error occurred during checkout initialization');
    } finally {
      setLoading(false);
    }
  };

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50/50">
        <Card className="w-[400px] border-destructive/20 shadow-lg">
          <CardHeader>
            <CardTitle className="text-destructive">Checkout Error</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
             <Button variant="outline" className="w-full" onClick={() => navigate('/plans')}>Return to Plans</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Calculate totals for summary
  const total = cartItems?.reduce((sum: number, item: any) => sum + (item.price || 0), 0) || 0;
  const billingInterval = cartItems?.[0]?.interval || interval;

  return (
    <div className="min-h-screen bg-gray-50/50 p-4 lg:p-8">
      <div className="mx-auto max-w-6xl grid gap-8 lg:grid-cols-2 lg:h-[calc(100vh-4rem)]">
        
        {/* Left Column: Order Summary */}
        <div className="flex flex-col gap-6 order-2 lg:order-1 h-full max-h-[calc(100vh-6rem)] overflow-hidden">
            <div className="flex items-center gap-2 mb-2">
                <Button variant="ghost" size="sm" onClick={() => navigate('/plans')} className="text-muted-foreground hover:text-foreground -ml-2">
                    ← Back to Plans
                </Button>
            </div>
            
            <Card className="flex-1 flex flex-col border-none shadow-md bg-white overflow-hidden">
                <CardHeader className="bg-primary/5 pb-6 border-b">
                    <CardTitle className="text-2xl">Order Summary</CardTitle>
                    <CardDescription>Review your subscription details</CardDescription>
                </CardHeader>
                
                <ScrollArea className="flex-1 w-full relative">
                    <CardContent className="p-6 space-y-6">
                        {cartItems ? (
                             <div className="space-y-4">
                                {cartItems.map((item: any, idx: number) => (
                                    <div key={idx} className="space-y-3 pb-4 border-b last:border-0">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h3 className="font-semibold text-lg">{item.name} {item.tier ? `(${item.tier})` : ''}</h3>
                                                <div className="flex gap-2 mt-1">
                                                    <Badge variant="outline" className="capitalize">{item.type}</Badge>
                                                    <Badge variant="secondary" className="capitalize">{item.interval}</Badge>
                                                </div>
                                            </div>
                                            <p className="font-bold text-lg">
                                                ${item.price.toFixed(2)} 
                                                <span className="text-sm text-muted-foreground font-normal">/{item.interval === 'yearly' ? 'yr' : 'mo'}</span>
                                            </p>
                                        </div>
                                        
                                        {/* Features & Limits */}
                                        <div className="bg-muted/30 rounded-lg p-3 text-sm space-y-2">
                                            {item.limits && (
                                                <div className="flex items-center gap-2 text-muted-foreground">
                                                     <ShieldCheck className="h-4 w-4 text-primary" />
                                                     <span>{item.limits}</span>
                                                </div>
                                            )}
                                            {item.features && item.features.length > 0 && (
                                                <div className="mt-2 space-y-3">
                                                    {Object.entries(
                                                        item.features.reduce((acc: any, feature: any) => {
                                                            const tool = feature.toolName || 'General Features';
                                                            if (!acc[tool]) acc[tool] = [];
                                                            acc[tool].push(feature);
                                                            return acc;
                                                        }, {})
                                                    ).map(([toolName, features]: [string, any], groupIdx: number) => (
                                                        <div key={groupIdx} className="space-y-1.5">
                                                            {toolName !== 'General Features' && (
                                                                <h4 className="text-xs font-semibold text-primary/80 uppercase tracking-wider pl-1">{toolName}</h4>
                                                            )}
                                                            <ul className="grid grid-cols-1 gap-1.5">
                                                                {features.map((feature: any, i: number) => (
                                                                    <li key={i} className="flex items-start gap-2 text-muted-foreground/90 pl-1">
                                                                        {feature.isEnabled ? (
                                                                            <Check className="h-3.5 w-3.5 mt-0.5 text-green-600 shrink-0" />
                                                                        ) : (
                                                                            <span className="text-red-500 h-3.5 w-3.5 mt-0.5 shrink-0">✕</span>
                                                                        )}
                                                                        <div className="flex-1">
                                                                            <span className="text-xs leading-tight block">{feature.name}</span>
                                                                            {feature.limit && (
                                                                                <span className="text-[10px] text-muted-foreground font-medium">Limit: {feature.limit}</span>
                                                                            )}
                                                                        </div>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                             </div>
                        ) : (
                            <p className="text-muted-foreground">Loading details...</p>
                        )}
                    </CardContent>
                </ScrollArea>

                <div className="p-6 bg-muted/10 border-t mt-auto">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span>${total.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center mb-4">
                        <span className="text-muted-foreground">Tax</span>
                        <span className="text-xs text-muted-foreground">Calculated at next step</span>
                    </div>
                    <div className="flex justify-between items-center pt-4 border-t border-dashed">
                         <span className="text-lg font-bold">Total due today</span>
                         <span className="text-2xl font-bold text-primary">
                             ${total.toFixed(2)}
                             <span className="text-sm text-muted-foreground font-normal ml-1">USD</span>
                         </span>
                    </div>
                </div>
            </Card>
        </div>

        {/* Right Column: Stripe Checkout */}
        <div className="order-1 lg:order-2 h-full">
            <Card className="h-full border-none shadow-md overflow-hidden flex flex-col">
                <CardHeader className="border-b bg-white">
                    <CardTitle className="flex items-center gap-2">
                        Payment Details
                        <LockIcon className="h-4 w-4 text-green-600" />
                    </CardTitle>
                </CardHeader>
                <div className="flex-1 overflow-y-auto bg-white p-1">
                    {clientSecret ? (
                        <EmbeddedCheckoutProvider
                            stripe={stripePromise}
                            options={{ clientSecret }}
                        >
                            <EmbeddedCheckout className="h-full w-full" />
                        </EmbeddedCheckoutProvider>
                    ) : (
                        <div className="flex h-full items-center justify-center min-h-[400px]">
                             <div className="flex flex-col items-center gap-3">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                <p className="text-muted-foreground text-sm">Initializing secure checkout...</p>
                             </div>
                        </div>
                    )}
                </div>
            </Card>
        </div>

      </div>
    </div>
  );
}

function LockIcon(props: any) {
    return (
      <svg
        {...props}
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    )
}
