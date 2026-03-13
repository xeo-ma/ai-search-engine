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

function shortId(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  if (value.length <= 10) {
    return value;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
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
    console.error('[billing/webhook] Signature verification failed.', {
      message: error instanceof Error ? error.message : 'Unknown signature error',
    });
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Invalid Stripe webhook signature.' },
      { status: 400 },
    );
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      const stripeCustomerId = session.customer && typeof session.customer === 'string' ? session.customer : null;

      console.info('[billing/webhook] Processing checkout.session.completed.', {
        userId: shortId(userId),
        stripeCustomerId: shortId(stripeCustomerId),
      });

      if (userId && stripeCustomerId) {
        try {
          await prisma.user.update({
            where: { id: userId },
            data: {
              stripeCustomerId,
            },
          });
          console.info('[billing/webhook] Linked Stripe customer to user.', {
            userId: shortId(userId),
            stripeCustomerId: shortId(stripeCustomerId),
          });
        } catch (error) {
          console.error('[billing/webhook] Failed to link Stripe customer after checkout.', {
            userId: shortId(userId),
            stripeCustomerId: shortId(stripeCustomerId),
            message: error instanceof Error ? error.message : 'Unknown database error',
          });
          return NextResponse.json({ message: 'Unable to persist checkout completion.' }, { status: 500 });
        }
      }
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const stripeCustomerId =
        typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
      const metadataUserId = subscription.metadata?.userId;

      console.info('[billing/webhook] Processing subscription event.', {
        eventType: event.type,
        subscriptionId: shortId(subscription.id),
        stripeCustomerId: shortId(stripeCustomerId),
        metadataUserId: shortId(metadataUserId),
        status: subscription.status,
      });

      let user = await prisma.user.findFirst({
        where: {
          stripeCustomerId,
        },
        select: {
          id: true,
        },
      });

      if (user) {
        console.info('[billing/webhook] Resolved user by stripeCustomerId.', {
          eventType: event.type,
          userId: shortId(user.id),
          stripeCustomerId: shortId(stripeCustomerId),
        });
      }

      if (!user && metadataUserId) {
        user = await prisma.user.findUnique({
          where: {
            id: metadataUserId,
          },
          select: {
            id: true,
          },
        });

        if (user) {
          console.info('[billing/webhook] Resolved user by metadata fallback.', {
            eventType: event.type,
            userId: shortId(user.id),
            stripeCustomerId: shortId(stripeCustomerId),
          });

          try {
            await prisma.user.update({
              where: { id: user.id },
              data: {
                stripeCustomerId,
              },
            });
          } catch (error) {
            console.error('[billing/webhook] Failed to backfill stripeCustomerId from metadata.', {
              eventType: event.type,
              userId: shortId(user.id),
              stripeCustomerId: shortId(stripeCustomerId),
              message: error instanceof Error ? error.message : 'Unknown database error',
            });
            return NextResponse.json({ message: 'Unable to persist subscription customer link.' }, { status: 500 });
          }
        }
      }

      if (!user) {
        console.error('[billing/webhook] Unable to resolve user for subscription event.', {
          eventType: event.type,
          subscriptionId: shortId(subscription.id),
          stripeCustomerId: shortId(stripeCustomerId),
          metadataUserId: shortId(metadataUserId),
        });
        break;
      }

      const isActive = ['active', 'trialing'].includes(subscription.status);

      try {
        await prisma.subscription.upsert({
          where: {
            stripeSubscriptionId: subscription.id,
          },
          update: {
            status: subscription.status,
            priceId: subscription.items.data[0]?.price.id ?? null,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            currentPeriodEnd: toDate(subscription.items.data[0]?.current_period_end),
          },
          create: {
            userId: user.id,
            stripeCustomerId,
            stripeSubscriptionId: subscription.id,
            status: subscription.status,
            priceId: subscription.items.data[0]?.price.id ?? null,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
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
      } catch (error) {
        console.error('[billing/webhook] Failed to persist subscription or entitlement update.', {
          eventType: event.type,
          userId: shortId(user.id),
          subscriptionId: shortId(subscription.id),
          stripeCustomerId: shortId(stripeCustomerId),
          message: error instanceof Error ? error.message : 'Unknown database error',
        });
        return NextResponse.json({ message: 'Unable to persist subscription state.' }, { status: 500 });
      }

      console.info('[billing/webhook] Subscription state applied.', {
        eventType: event.type,
        userId: shortId(user.id),
        subscriptionId: shortId(subscription.id),
        plan: isActive ? 'pro' : 'free',
      });
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
