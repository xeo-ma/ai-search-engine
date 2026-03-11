import Stripe from 'stripe';

let stripeClient: Stripe | null = null;

export function getStripeServerClient(): Stripe {
  if (stripeClient) {
    return stripeClient;
  }

  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    throw new Error('Missing STRIPE_SECRET_KEY');
  }

  stripeClient = new Stripe(apiKey, {
    apiVersion: '2026-02-25.clover',
  });

  return stripeClient;
}
