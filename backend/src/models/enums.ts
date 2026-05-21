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

export enum CreditEntryType {
  GRANT = 'grant',
  CONSUME = 'consume',
  RESERVE = 'reserve',
  RELEASE = 'release',
  SETTLE = 'settle',
  ADJUSTMENT = 'adjustment',
  REFUND = 'refund',
  EXPIRE = 'expire',
}

export enum CreditBucket {
  PLAN = 'plan',
  PURCHASED = 'purchased',
  TRIAL = 'trial',
}

export enum CreditResetInterval {
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
  NEVER = 'never',
}

export enum CreditOnCancel {
  FORFEIT_IMMEDIATE = 'forfeit_immediate',
  // Credits stay usable until the grant's own reset cadence (next_reset_at)
  // elapses — NOT the Stripe subscription's billing period. Invalid combined
  // with reset_interval='never'; the admin layer rejects that combination.
  KEEP_TILL_GRANT_PERIOD_END = 'keep_till_grant_period_end',
  KEEP_FOREVER = 'keep_forever',
}

export enum CreditReservationStatus {
  HELD = 'held',
  SETTLED = 'settled',
  RELEASED = 'released',
  EXPIRED = 'expired',
}
