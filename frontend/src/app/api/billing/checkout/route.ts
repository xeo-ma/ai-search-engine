import { NextResponse } from 'next/server';

import { getAuthSession } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';
import { getStripeServerClient } from '../../../../lib/stripe';

export const runtime = 'nodejs';

export async function POST(): Promise<NextResponse> {
  const session = await getAuthSession();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ message: 'Authentication required.' }, { status: 401 });
  }

  const priceId = process.env.STRIPE_PRO_PRICE_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  if (!priceId) {
    return NextResponse.json({ message: 'Billing is not configured yet.' }, { status: 503 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      stripeCustomerId: true,
    },
  });

  if (!user?.email) {
    return NextResponse.json({ message: 'No email is associated with this account.' }, { status: 400 });
  }

  const stripe = getStripeServerClient();
  let stripeCustomerId = user.stripeCustomerId;

  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: {
        userId,
      },
    });

    stripeCustomerId = customer.id;

    await prisma.user.update({
      where: { id: userId },
      data: {
        stripeCustomerId,
      },
    });
  }

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: stripeCustomerId,
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: `${appUrl}/?billing=success`,
    cancel_url: `${appUrl}/?billing=cancelled`,
    metadata: {
      userId,
    },
  });

  return NextResponse.json({ url: checkoutSession.url }, { status: 200 });
}
