import { createHash } from 'crypto';

import { hash } from 'bcryptjs';
import { NextResponse } from 'next/server';

import { prisma } from '../../../../lib/db';

export const runtime = 'nodejs';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: { token?: string; password?: string };

  try {
    body = (await request.json()) as { token?: string; password?: string };
  } catch {
    return NextResponse.json({ message: 'Invalid JSON request body.' }, { status: 400 });
  }

  const token = body.token?.trim();
  const password = body.password ?? '';

  if (!token || !password) {
    return NextResponse.json({ message: 'Token and password are required.' }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ message: 'Password must be at least 8 characters.' }, { status: 400 });
  }

  const tokenHash = hashToken(token);
  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      usedAt: true,
    },
  });

  if (!resetToken || resetToken.usedAt || resetToken.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ message: 'This password reset link is invalid or has expired.' }, { status: 400 });
  }

  const passwordHash = await hash(password, 12);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetToken.userId },
      data: {
        passwordHash,
      },
    }),
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: {
        usedAt: new Date(),
      },
    }),
    prisma.passwordResetToken.deleteMany({
      where: {
        userId: resetToken.userId,
        id: {
          not: resetToken.id,
        },
      },
    }),
  ]);

  return NextResponse.json({ message: 'Password updated successfully.' }, { status: 200 });
}
