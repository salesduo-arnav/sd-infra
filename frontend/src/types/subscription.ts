
export interface PaymentMethodDetails {
    brand: string;
    last4: string;
    exp_month: number;
    exp_year: number;
}

export interface SubscriptionPlan {
    id: string;
    name: string;
    price: number;
    interval: string;
    currency: string;
    is_trial_plan?: boolean;
    tier?: string;
    tool?: {
        id: string;
        name: string;
        slug: string;
    };
    limits?: {
        feature?: {
            name: string;
        };
        default_limit: number | null;
        is_enabled: boolean;
    }[];
}

export interface SubscriptionBundle {
    id: string;
    name: string;
    price: number;
    interval: string;
    currency: string;
    tier_label?: string;
    group?: {
        id: string;
        name: string;
        slug: string;
    };
}

export interface Subscription {
    id: string;
    stripe_subscription_id: string;
    status: 'active' | 'trialing' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'past_due' | 'unpaid' | 'paused';
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    created: number;
    
    plan?: SubscriptionPlan | null;
    bundle?: SubscriptionBundle | null;
    
    upcoming_plan?: SubscriptionPlan | null;
    upcoming_plan_id?: string | null;

    upcoming_bundle?: SubscriptionBundle | null;
    upcoming_bundle_id?: string | null;

    paymentMethodDetails?: PaymentMethodDetails | null;
}

export interface Invoice {
    id: string;
    number: string;
    created: number;
    amount_due: number;
    currency: string;
    status: 'draft' | 'open' | 'paid' | 'uncollectible' | 'void';
    invoice_pdf: string | null;
}
