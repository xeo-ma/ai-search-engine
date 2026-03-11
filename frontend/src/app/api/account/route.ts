import { NextResponse } from 'next/server';

import { getAuthSession } from '../../../lib/auth';
import { getSearchAccountState } from '../../../lib/account-state';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  const session = await getAuthSession();
  const accountState = await getSearchAccountState(session?.user?.id);
  return NextResponse.json(accountState, { status: 200 });
}
