import { NextResponse } from 'next/server';

import { getAuthSession } from '../../../../lib/auth';
import { updateSearchPreferences } from '../../../../lib/account-state';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getAuthSession();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ message: 'Authentication required.' }, { status: 401 });
  }

  let body: { deepSearchEnabled?: boolean; safeMode?: boolean };
  try {
    body = (await request.json()) as { deepSearchEnabled?: boolean; safeMode?: boolean };
  } catch {
    return NextResponse.json({ message: 'Invalid JSON request body' }, { status: 400 });
  }

  const accountState = await updateSearchPreferences(userId, {
    deepSearchEnabled: typeof body.deepSearchEnabled === 'boolean' ? body.deepSearchEnabled : undefined,
    safeMode: typeof body.safeMode === 'boolean' ? body.safeMode : undefined,
  });

  return NextResponse.json(accountState, { status: 200 });
}
