import { NextResponse } from 'next/server';
import Stripe from 'stripe';

import { prisma } from '../../../../lib/db';
import { getStripeServerClient } from '../../../../lib/stripe';

export const runtime = 'nodejs';

function toDate(unixSeconds: number | null | undefined): Date | null {
  if (!unixSeconds) {
    return null;
  }

  return new Date(unixSeconds * 1000);
}

export async function POST(request: Request): Promise<NextResponse> {
  const signingSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signingSecret) {
    return NextResponse.json({ message: 'Missing STRIPE_WEBHOOK_SECRET.' }, { status: 503 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ message: 'Missing Stripe signature.' }, { status: 400 });
  }

  const stripe = getStripeServerClient();
  const body = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, signingSecret);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Invalid Stripe webhook signature.' },
      { status: 400 },
    );
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;

      if (userId && session.customer && typeof session.customer === 'string') {
        await prisma.user.update({
          where: { id: userId },
          data: {
            stripeCustomerId: session.customer,
          },
        });
      }
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const stripeCustomerId =
        typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

      const user = await prisma.user.findFirst({
        where: {
          stripeCustomerId,
        },
        select: {
          id: true,
        },
      });

      if (!user) {
        break;
      }

      const isActive = ['active', 'trialing'].includes(subscription.status);

      await prisma.subscription.upsert({
        where: {
          stripeSubscriptionId: subscription.id,
        },
        update: {
          status: subscription.status,
          priceId: subscription.items.data[0]?.price.id ?? null,
          currentPeriodEnd: toDate(subscription.items.data[0]?.current_period_end),
        },
        create: {
          userId: user.id,
          stripeCustomerId,
          stripeSubscriptionId: subscription.id,
          status: subscription.status,
          priceId: subscription.items.data[0]?.price.id ?? null,
          currentPeriodEnd: toDate(subscription.items.data[0]?.current_period_end),
        },
      });

      await prisma.entitlement.upsert({
        where: {
          userId: user.id,
        },
        update: {
          plan: isActive ? 'pro' : 'free',
          deepSearchAvailable: isActive,
        },
        create: {
          userId: user.id,
          plan: isActive ? 'pro' : 'free',
          deepSearchAvailable: isActive,
        },
      });
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
