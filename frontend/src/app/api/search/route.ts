import { NextResponse } from 'next/server';

import { getAuthSession } from '../../../lib/auth';
import { getSearchAccountState, incrementAuthenticatedUsage } from '../../../lib/account-state';

const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

type SearchRequestBody = {
  query?: string;
  safeMode?: boolean;
  plan?: 'free' | 'pro';
  deepSearch?: boolean;
  count?: number;
  offset?: number;
};

export async function POST(request: Request): Promise<NextResponse> {
  let body: SearchRequestBody;

  try {
    body = (await request.json()) as SearchRequestBody;
  } catch {
    return NextResponse.json({ message: 'Invalid JSON request body' }, { status: 400 });
  }

  try {
    const session = await getAuthSession();
    const accountState = await getSearchAccountState(session?.user?.id);
    const isInitialPage = typeof body.offset !== 'number' || body.offset <= 0;

    if (
      accountState.authenticated &&
      accountState.plan === 'free' &&
      isInitialPage &&
      (accountState.freeSearchesRemaining ?? 0) <= 0
    ) {
      return NextResponse.json(
        { message: 'Free plan limit reached for today. Upgrade to Pro to keep searching.' },
        { status: 429 },
      );
    }

    const forwardedBody: SearchRequestBody = {
      ...body,
      plan: accountState.plan,
      deepSearch:
        accountState.authenticated &&
        accountState.deepSearchAvailable &&
        accountState.deepSearchEnabled &&
        body.deepSearch === true,
    };

    const backendResponse = await fetch(`${BACKEND_BASE_URL}/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(forwardedBody),
      cache: 'no-store',
    });

    const contentType = backendResponse.headers.get('content-type') ?? '';

    if (contentType.includes('application/json')) {
      const data = (await backendResponse.json()) as unknown;
      if (
        backendResponse.ok &&
        accountState.authenticated &&
        accountState.userId &&
        accountState.plan === 'free' &&
        isInitialPage
      ) {
        await incrementAuthenticatedUsage(accountState.userId);
      }
      return NextResponse.json(data, { status: backendResponse.status });
    }

    const text = await backendResponse.text();
    return NextResponse.json(
      { message: text || `Backend request failed with status ${backendResponse.status}` },
      { status: backendResponse.status },
    );
  } catch {
    return NextResponse.json(
      { message: 'Search backend is unavailable. Make sure it is running on port 3001.' },
      { status: 503 },
    );
  }
}
