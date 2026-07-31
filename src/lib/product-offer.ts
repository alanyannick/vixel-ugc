export const FOUNDING_BETA_OFFER = {
  amountCents: 3_900,
  currency: "usd",
  interval: "month",
  intervalCount: 1,
} as const;

export function formatFoundingBetaPrice(): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: FOUNDING_BETA_OFFER.currency,
    maximumFractionDigits: 0,
  }).format(FOUNDING_BETA_OFFER.amountCents / 100);
}
