import { prisma } from './db';

export const FREE_AUTH_DAILY_SEARCH_LIMIT = 25;

export interface SearchAccountState {
  authenticated: boolean;
  userId: string | null;
  email: string | null;
  plan: 'free' | 'pro';
  subscriptionStatus: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  deepSearchAvailable: boolean;
  deepSearchEnabled: boolean;
  safeMode: boolean;
  freeSearchesRemaining: number | null;
}

export function getUsageDayKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export async function getSearchAccountState(userId: string | null | undefined): Promise<SearchAccountState> {
  if (!userId) {
    return {
      authenticated: false,
      userId: null,
      email: null,
      plan: 'free',
      subscriptionStatus: null,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
      deepSearchAvailable: false,
      deepSearchEnabled: false,
      safeMode: true,
      freeSearchesRemaining: null,
    };
  }

  await prisma.entitlement.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      plan: 'free',
      deepSearchAvailable: false,
    },
  });

  await prisma.userPreference.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      deepSearchEnabled: false,
      safeMode: true,
    },
  });

  const [user, usage] = await prisma.$transaction([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        entitlement: {
          select: {
            plan: true,
            deepSearchAvailable: true,
          },
        },
        subscription: {
          select: {
            status: true,
            cancelAtPeriodEnd: true,
            currentPeriodEnd: true,
          },
        },
        preference: {
          select: {
            deepSearchEnabled: true,
            safeMode: true,
          },
        },
      },
    }),
    prisma.usageRecord.findUnique({
      where: {
        userId_dayKey: {
          userId,
          dayKey: getUsageDayKey(),
        },
      },
      select: {
        searchCount: true,
      },
    }),
  ]);

  const plan = user?.entitlement?.plan === 'pro' ? 'pro' : 'free';
  const freeSearchesRemaining =
    plan === 'free' ? Math.max(0, FREE_AUTH_DAILY_SEARCH_LIMIT - (usage?.searchCount ?? 0)) : null;

  return {
    authenticated: true,
    userId,
    email: user?.email ?? null,
    plan,
    subscriptionStatus: user?.subscription?.status ?? null,
    cancelAtPeriodEnd: user?.subscription?.cancelAtPeriodEnd ?? false,
    currentPeriodEnd: user?.subscription?.currentPeriodEnd?.toISOString() ?? null,
    deepSearchAvailable: Boolean(user?.entitlement?.deepSearchAvailable),
    deepSearchEnabled: Boolean(user?.preference?.deepSearchEnabled),
    safeMode: user?.preference?.safeMode ?? true,
    freeSearchesRemaining,
  };
}

export async function updateSearchPreferences(
  userId: string,
  input: { deepSearchEnabled?: boolean; safeMode?: boolean },
): Promise<SearchAccountState> {
  await prisma.userPreference.upsert({
    where: { userId },
    update: {
      ...(typeof input.deepSearchEnabled === 'boolean' ? { deepSearchEnabled: input.deepSearchEnabled } : {}),
      ...(typeof input.safeMode === 'boolean' ? { safeMode: input.safeMode } : {}),
    },
    create: {
      userId,
      deepSearchEnabled: input.deepSearchEnabled ?? false,
      safeMode: input.safeMode ?? true,
    },
  });

  return getSearchAccountState(userId);
}

export async function incrementAuthenticatedUsage(userId: string): Promise<SearchAccountState> {
  await prisma.usageRecord.upsert({
    where: {
      userId_dayKey: {
        userId,
        dayKey: getUsageDayKey(),
      },
    },
    update: {
      searchCount: {
        increment: 1,
      },
    },
    create: {
      userId,
      dayKey: getUsageDayKey(),
      searchCount: 1,
    },
  });

  return getSearchAccountState(userId);
}
