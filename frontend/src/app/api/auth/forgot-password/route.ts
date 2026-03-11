import { createHash, randomBytes } from 'crypto';

import { NextResponse } from 'next/server';

import { sendPasswordResetEmail, isEmailDeliveryConfigured } from '../../../../lib/auth-email';
import { prisma } from '../../../../lib/db';

export const runtime = 'nodejs';

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: { email?: string };

  try {
    body = (await request.json()) as { email?: string };
  } catch {
    return NextResponse.json({ message: 'Invalid JSON request body.' }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ message: 'Email is required.' }, { status: 400 });
  }

  if (!isEmailDeliveryConfigured()) {
    return NextResponse.json({ message: 'Password reset email is not configured yet.' }, { status: 503 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
    },
  });

  if (!user?.email) {
    return NextResponse.json(
      { message: 'If an account exists for that email, a reset link has been sent.' },
      { status: 200 },
    );
  }

  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const resetUrl = `${appUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;

  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({
      where: { userId: user.id },
    }),
    prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    }),
  ]);

  await sendPasswordResetEmail({
    to: user.email,
    resetUrl,
  });

  return NextResponse.json(
    { message: 'If an account exists for that email, a reset link has been sent.' },
    { status: 200 },
  );
}
