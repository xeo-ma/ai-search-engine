import { createHash, randomBytes } from 'crypto';

import { NextResponse } from 'next/server';

import { sendPasswordResetEmail, getEmailDeliveryDiagnostics, isEmailDeliveryConfigured } from '../../../../lib/auth-email';
import { prisma } from '../../../../lib/db';

export const runtime = 'nodejs';

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function maskEmail(email: string): string {
  const [localPart, domain = ''] = email.split('@');
  const visibleLocal = localPart.length <= 2 ? localPart[0] ?? '*' : `${localPart[0]}***${localPart[localPart.length - 1]}`;
  return `${visibleLocal}@${domain}`;
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

  const maskedEmail = maskEmail(email);

  if (!isEmailDeliveryConfigured()) {
    console.warn('[auth/forgot-password] Email delivery is not configured.', {
      email: maskedEmail,
      diagnostics: getEmailDeliveryDiagnostics(),
    });
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
    console.info('[auth/forgot-password] No matching user found.', {
      email: maskedEmail,
    });
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

  try {
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

    console.info('[auth/forgot-password] Reset token created.', {
      email: maskedEmail,
      userId: user.id,
    });

    await sendPasswordResetEmail({
      to: user.email,
      resetUrl,
      expiresInMinutes: Math.round(PASSWORD_RESET_TTL_MS / 60000),
    });

    console.info('[auth/forgot-password] Reset email sent.', {
      email: maskedEmail,
      userId: user.id,
    });
  } catch (error) {
    console.error('[auth/forgot-password] Failed to create reset flow.', {
      email: maskedEmail,
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json({ message: 'Unable to send password reset email.' }, { status: 500 });
  }

  return NextResponse.json(
    { message: 'If an account exists for that email, a reset link has been sent.' },
    { status: 200 },
  );
}
