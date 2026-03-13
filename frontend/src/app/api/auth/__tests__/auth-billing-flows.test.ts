import { hash } from 'bcryptjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = {
  user: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  passwordResetToken: {
    deleteMany: vi.fn(),
    create: vi.fn(),
  },
  subscription: {
    upsert: vi.fn(),
  },
  entitlement: {
    upsert: vi.fn(),
  },
  $transaction: vi.fn(async (operations: Array<Promise<unknown> | unknown>) => Promise.all(operations)),
};

const sendPasswordResetEmailMock = vi.fn();
const isEmailDeliveryConfiguredMock = vi.fn(() => true);
const getEmailDeliveryDiagnosticsMock = vi.fn(() => ({
  hasHost: true,
  hasPort: true,
  portIsNumber: true,
  hasUser: true,
  hasPassword: true,
  hasFrom: true,
}));
const getAuthSessionMock = vi.fn();

const stripeMock = {
  customers: {
    create: vi.fn(),
  },
  checkout: {
    sessions: {
      create: vi.fn(),
    },
  },
  billingPortal: {
    sessions: {
      create: vi.fn(),
    },
  },
  webhooks: {
    constructEvent: vi.fn(),
  },
};

vi.mock('../../../../lib/db', () => ({
  prisma: prismaMock,
}));

vi.mock('../../../../lib/auth-email', () => ({
  sendPasswordResetEmail: sendPasswordResetEmailMock,
  isEmailDeliveryConfigured: isEmailDeliveryConfiguredMock,
  getEmailDeliveryDiagnostics: getEmailDeliveryDiagnosticsMock,
}));

vi.mock('../../../../lib/auth', async () => {
  const actual = await vi.importActual<typeof import('../../../../lib/auth')>('../../../../lib/auth');
  return {
    ...actual,
    getAuthSession: getAuthSessionMock,
  };
});

vi.mock('../../../../lib/stripe', () => ({
  getStripeServerClient: () => stripeMock,
}));

describe('auth and billing flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_PRO_PRICE_ID = 'price_test_123';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_123';
    process.env.NEXT_PUBLIC_APP_URL = 'https://www.lensquery.com';
  });

  it('signs up a user with a hashed password and default entitlement state', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({
      id: 'user_123',
      email: 'user@example.com',
      name: 'User',
    });

    const { POST } = await import('../register/route');
    const response = await POST(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'user@example.com',
          password: 'supersecret',
          name: 'User',
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'user@example.com',
          passwordHash: expect.any(String),
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
        }),
      }),
    );
  });

  it('signs in with credentials via the auth credentials provider', async () => {
    const passwordHash = await hash('supersecret', 12);
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_123',
      email: 'user@example.com',
      name: 'User',
      passwordHash,
    });

    const { authOptions } = await import('../../../../lib/auth');
    const credentialsProvider = authOptions.providers.find((provider) => provider.id === 'credentials') as unknown as {
      authorize?: (
        credentials: Record<string, string>,
        request: {
          method: string;
          body: Record<string, string>;
          query: Record<string, string>;
          headers: Record<string, string>;
        },
      ) => Promise<unknown>;
      options?: {
        authorize?: (
          credentials: Record<string, string>,
          request: {
            method: string;
            body: Record<string, string>;
            query: Record<string, string>;
            headers: Record<string, string>;
          },
        ) => Promise<unknown>;
      };
    };

    const authorize =
      credentialsProvider.options?.authorize ??
      credentialsProvider.authorize;

    expect(authorize).toBeTypeOf('function');

    const user = await authorize!(
      {
        email: 'user@example.com',
        password: 'supersecret',
      },
      {
        method: 'POST',
        body: {},
        query: {},
        headers: {},
      },
    );

    expect(user).toEqual({
      id: 'user_123',
      email: 'user@example.com',
      name: 'User',
    });
  });

  it('creates a password reset token and sends reset email', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_123',
      email: 'user@example.com',
    });
    prismaMock.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.passwordResetToken.create.mockResolvedValue({ id: 'reset_123' });

    const { POST } = await import('../forgot-password/route');
    const response = await POST(
      new Request('http://localhost/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'user@example.com',
        }),
      }),
    );

    const body = (await response.json()) as { message: string };
    expect(response.status).toBe(200);
    expect(body.message).toMatch(/reset link has been sent/i);
    expect(prismaMock.passwordResetToken.create).toHaveBeenCalled();
    expect(sendPasswordResetEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        resetUrl: expect.stringContaining('/reset-password?token='),
      }),
    );
  });

  it('creates a checkout session for an authenticated user upgrading to Pro', async () => {
    getAuthSessionMock.mockResolvedValue({
      user: {
        id: 'user_123',
      },
    });
    prismaMock.user.findUnique.mockResolvedValue({
      email: 'user@example.com',
      stripeCustomerId: null,
    });
    prismaMock.user.update.mockResolvedValue({ id: 'user_123' });
    stripeMock.customers.create.mockResolvedValue({ id: 'cus_123' });
    stripeMock.checkout.sessions.create.mockResolvedValue({ url: 'https://checkout.stripe.test/session' });

    const { POST } = await import('../../billing/checkout/route');
    const response = await POST();
    const body = (await response.json()) as { url: string };

    expect(response.status).toBe(200);
    expect(body.url).toBe('https://checkout.stripe.test/session');
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalled();
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user_123' },
        data: { stripeCustomerId: 'cus_123' },
      }),
    );
  });

  it('creates a custom checkout session client secret for in-app billing', async () => {
    getAuthSessionMock.mockResolvedValue({
      user: {
        id: 'user_123',
      },
    });
    prismaMock.user.findUnique.mockResolvedValue({
      email: 'user@example.com',
      stripeCustomerId: null,
      entitlement: {
        plan: 'free',
      },
    });
    prismaMock.user.update.mockResolvedValue({ id: 'user_123' });
    stripeMock.customers.create.mockResolvedValue({ id: 'cus_123' });
    stripeMock.checkout.sessions.create.mockResolvedValue({ client_secret: 'cs_test_123' });

    const { POST } = await import('../../billing/custom-checkout/route');
    const response = await POST();
    const body = (await response.json()) as { clientSecret: string };

    expect(response.status).toBe(200);
    expect(body.clientSecret).toBe('cs_test_123');
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ui_mode: 'custom',
        mode: 'subscription',
      }),
    );
  });

  it('updates entitlement to pro when Stripe webhook reports active subscription', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue({
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_123',
          customer: 'cus_123',
          status: 'active',
          items: {
            data: [
              {
                price: { id: 'price_test_123' },
                current_period_end: 1_800_000_000,
              },
            ],
          },
        },
      },
    });
    prismaMock.user.findFirst.mockResolvedValue({ id: 'user_123' });
    prismaMock.subscription.upsert.mockResolvedValue({ id: 'sub_record' });
    prismaMock.entitlement.upsert.mockResolvedValue({ id: 'entitlement_123' });

    const { POST } = await import('../../billing/webhook/route');
    const response = await POST(
      new Request('http://localhost/api/billing/webhook', {
        method: 'POST',
        headers: {
          'stripe-signature': 'signature',
        },
        body: JSON.stringify({ fake: true }),
      }),
    );

    expect(response.status).toBe(200);
    expect(prismaMock.entitlement.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user_123' },
        update: {
          plan: 'pro',
          deepSearchAvailable: true,
        },
      }),
    );
  });

  it('falls back to subscription metadata userId when stripeCustomerId has not been written yet', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue({
      type: 'customer.subscription.created',
      data: {
        object: {
          id: 'sub_123',
          customer: 'cus_123',
          status: 'active',
          metadata: {
            userId: 'user_123',
          },
          items: {
            data: [
              {
                price: { id: 'price_test_123' },
                current_period_end: 1_800_000_000,
              },
            ],
          },
        },
      },
    });
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.user.findUnique.mockResolvedValue({ id: 'user_123' });
    prismaMock.user.update.mockResolvedValue({ id: 'user_123', stripeCustomerId: 'cus_123' });
    prismaMock.subscription.upsert.mockResolvedValue({ id: 'sub_record' });
    prismaMock.entitlement.upsert.mockResolvedValue({ id: 'entitlement_123' });

    const { POST } = await import('../../billing/webhook/route');
    const response = await POST(
      new Request('http://localhost/api/billing/webhook', {
        method: 'POST',
        headers: {
          'stripe-signature': 'signature',
        },
        body: JSON.stringify({ fake: true }),
      }),
    );

    expect(response.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user_123' },
        data: { stripeCustomerId: 'cus_123' },
      }),
    );
    expect(prismaMock.entitlement.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user_123' },
        update: {
          plan: 'pro',
          deepSearchAvailable: true,
        },
      }),
    );
  });

  it('opens the Stripe billing portal for an authenticated Pro user', async () => {
    getAuthSessionMock.mockResolvedValue({
      user: {
        id: 'user_123',
      },
    });
    prismaMock.user.findUnique.mockResolvedValue({
      stripeCustomerId: 'cus_123',
    });
    stripeMock.billingPortal.sessions.create.mockResolvedValue({
      url: 'https://billing.stripe.test/session',
    });

    const { POST } = await import('../../billing/portal/route');
    const response = await POST();
    const body = (await response.json()) as { url: string };

    expect(response.status).toBe(200);
    expect(body.url).toBe('https://billing.stripe.test/session');
    expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_123',
      }),
    );
  });
});
