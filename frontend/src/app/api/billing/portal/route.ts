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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      stripeCustomerId: true,
    },
  });

  if (!user?.stripeCustomerId) {
    return NextResponse.json({ message: 'No billing account found for this user.' }, { status: 404 });
  }

  const stripe = getStripeServerClient();
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${appUrl}/billing`,
  });

  return NextResponse.json({ url: portalSession.url }, { status: 200 });
}
