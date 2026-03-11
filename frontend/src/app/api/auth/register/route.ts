import { hash } from 'bcryptjs';
import { NextResponse } from 'next/server';

import { prisma } from '../../../../lib/db';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<NextResponse> {
  let body: { email?: string; password?: string; name?: string };

  try {
    body = (await request.json()) as { email?: string; password?: string; name?: string };
  } catch {
    return NextResponse.json({ message: 'Invalid JSON request body' }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? '';
  const name = body.name?.trim() || null;

  if (!email || !password) {
    return NextResponse.json({ message: 'Email and password are required.' }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ message: 'Password must be at least 8 characters.' }, { status: 400 });
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingUser) {
    return NextResponse.json({ message: 'An account already exists for that email.' }, { status: 409 });
  }

  const passwordHash = await hash(password, 12);

  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
      entitlement: {
        create: {
          plan: 'free',
          deepSearchAvailable: false,
        },
      },
      preference: {
        create: {
          deepSearchEnabled: false,
          safeMode: true,
        },
      },
    },
    select: {
      id: true,
      email: true,
      name: true,
    },
  });

  return NextResponse.json({ user }, { status: 201 });
}
