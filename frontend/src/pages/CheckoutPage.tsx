import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import axios from 'axios';
import { API_URL } from '@/lib/api';

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

  useEffect(() => {
    if (!planId && !bundleId && (!cartItems || cartItems.length === 0)) {
      setError('No items selected for checkout');
    }
  }, [planId, bundleId, cartItems]);

  const handleCheckout = async () => {
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
        items
      }, {
        withCredentials: true
      });

      if (response.data.url) {
        window.location.href = response.data.url;
      } else {
         setError('Failed to start checkout');
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
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-[350px]">
          <CardHeader>
            <CardTitle>Error</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button onClick={() => navigate('/plans')}>Go Back</Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <Card className="w-[400px]">
        <CardHeader>
          <CardTitle>Checkout</CardTitle>
          <CardDescription>
            You are subscribing to the {interval} plan.
          </CardDescription>
        </CardHeader>
        <CardContent>
           <div className="text-sm text-gray-500 mb-4">
             You will be redirected to Stripe to securely complete your payment.
           </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={() => navigate('/plans')}>Cancel</Button>
          <Button onClick={handleCheckout} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Proceed to Checkout
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
