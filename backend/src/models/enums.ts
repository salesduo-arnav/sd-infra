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
  INCOMPLETE_EXPIRED = 'incomplete_expired',
  UNPAID = 'unpaid',
  PAUSED = 'paused',
}

export enum FeatureResetPeriod {
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
  NEVER = 'never',
}

export enum InvitationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  EXPIRED = 'expired',
}

export enum OrgStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  ARCHIVED = 'archived',
}
