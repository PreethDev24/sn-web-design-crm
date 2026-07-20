/** Explicit opt-in only. Set NEXT_PUBLIC_DEMO_MODE=true to use local JSON store. */

export function isDemoMode(): boolean {
  return (
    process.env.NEXT_PUBLIC_DEMO_MODE === "true" || process.env.DEMO_MODE === "true"
  );
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export const DEMO_COOKIE = "sn_demo_user";
