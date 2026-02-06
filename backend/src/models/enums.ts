export enum PriceInterval {
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
  ONE_TIME = 'one_time',
}

export enum TierType {
  BASIC = 'basic',
  PREMIUM = 'premium',
  PLATINUM = 'platinum',
  DIAMOND = 'diamond',
}

export enum SubStatus {
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  CANCELED = 'canceled',
  TRIALING = 'trialing',
  INCOMPLETE = 'incomplete',
}

export enum FeatureType {
  BOOLEAN = 'boolean',
  METERED = 'metered',
}

export enum FeatureResetPeriod {
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
  NEVER = 'never',
}
