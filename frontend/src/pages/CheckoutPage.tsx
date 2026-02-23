import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Lock } from 'lucide-react';
import { CheckoutFeatureList } from '@/components/checkout/CheckoutFeatureList';
import { CartItem } from '@/components/plans/types';
import api from '@/lib/api';
import { loadStripe } from '@stripe/stripe-js';
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout
} from '@stripe/react-stripe-js';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

// Initialize Stripe (lazy to avoid error when key is not yet configured)
const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripeKey ? loadStripe(stripeKey) : null;

export default function CheckoutPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  
  const planId = searchParams.get('planId');
  const bundleId = searchParams.get('bundleId');
  const interval = searchParams.get('interval') || 'monthly';
  
  // Cart Items
  const cartItems = location.state?.items;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  const initializeCheckout = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Construct items
      let items = [];
      if (cartItems && cartItems.length > 0) {
          items = cartItems;
      } else if (planId) {
          items = [{ id: planId, type: 'plan', interval }];
      } else if (bundleId) {
          items = [{ id: bundleId, type: 'bundle', interval }];
      }

      const response = await api.post('/billing/checkout-session', {
        items,
        ui_mode: 'embedded'
      });

      if (response.data.clientSecret) {
        setClientSecret(response.data.clientSecret);
      } else {
         setError('Failed to initialize checkout session');
      }
    } catch (err: unknown) {
      console.error(err);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setError((err as any).response?.data?.message || 'An error occurred during checkout initialization');
    } finally {
      setLoading(false);
    }
  }, [cartItems, planId, bundleId, interval]);

  useEffect(() => {
    if ((!planId && !bundleId && (!cartItems || cartItems.length === 0))) {
      setError('No items selected for checkout');
      return;
    }
    
    // Auto-initialize checkout session
    initializeCheckout();
  }, [planId, bundleId, cartItems, initializeCheckout]);

  if (!stripePromise) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50/50">
        <Card className="w-[400px] border-destructive/20 shadow-lg">
          <CardHeader>
            <CardTitle className="text-destructive">Configuration Error</CardTitle>
            <CardDescription>Stripe is not configured. Please set VITE_STRIPE_PUBLISHABLE_KEY.</CardDescription>
          </CardHeader>
          <CardContent>
             <Button variant="outline" className="w-full" onClick={() => navigate('/plans')}>Return to Plans</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

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

  // Totals
  const total = cartItems?.reduce((sum: number, item: CartItem) => sum + (item.price || 0), 0) || 0;
  const billingInterval = cartItems?.[0]?.period || interval;
  const currency = cartItems?.[0]?.currency || 'USD';

  const formatPrice = (price: number, currencyCode = 'USD') => {
      return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: currencyCode.toUpperCase(),
          minimumFractionDigits: 0,
          maximumFractionDigits: 2
      }).format(price);
  };

  return (
    <div className="min-h-screen bg-gray-50/50 p-4 lg:p-8">
      <div className="mx-auto max-w-6xl grid gap-8 lg:grid-cols-2 lg:h-[calc(100vh-4rem)]">
        
        {/* Order Summary */}
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
                                {cartItems.map((item: CartItem, idx: number) => (
                                    <div key={idx} className="space-y-3 pb-4 border-b last:border-0">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h3 className="font-semibold text-lg">{item.name} {item.tierName ? `(${item.tierName})` : ''}</h3>
                                                <div className="flex gap-2 mt-1">
                                                    <Badge variant="outline" className="capitalize">{item.type}</Badge>
                                                    <Badge variant="secondary" className="capitalize">{item.period}</Badge>
                                                </div>
                                            </div>
                                            <p className="font-bold text-lg">
                                                {formatPrice(item.price, item.currency)} 
                                                {item.period === 'one_time' ? (
                                                    <span className="text-sm text-muted-foreground font-normal"> {item.currency || 'USD'} (one-time)</span>
                                                ) : (
                                                    <span className="text-sm text-muted-foreground font-normal"> {item.currency || 'USD'} /{item.period === 'yearly' ? 'yr' : 'mo'}</span>
                                                )}
                                            </p>
                                        </div>
                                        
                                        <CheckoutFeatureList features={item.features} limits={item.limits} />
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
                        <span>
                            {formatPrice(total, currency)}
                            <span className="text-xs text-muted-foreground font-normal ml-1">{currency.toUpperCase()}</span>
                        </span>
                    </div>
                    <div className="flex justify-between items-center mb-4">
                        <span className="text-muted-foreground">Tax</span>
                        <span className="text-xs text-muted-foreground">Calculated at next step</span>
                    </div>
                    <div className="flex justify-between items-center pt-4 border-t border-dashed">
                         <span className="text-lg font-bold">Total due today</span>
                         <span className="text-2xl font-bold text-primary">
                             {formatPrice(total, currency)}
                             <span className="text-sm text-muted-foreground font-normal ml-1">{currency.toUpperCase()}</span>
                         </span>
                    </div>
                </div>
            </Card>
        </div>

        {/* Stripe Checkout */}
        <div className="order-1 lg:order-2 h-full">
            <Card className="h-full border-none shadow-md overflow-hidden flex flex-col">
                <CardHeader className="border-b bg-white">
                    <CardTitle className="flex items-center gap-2">
                        Payment Details
                        <Lock className="h-4 w-4 text-green-600" />
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
