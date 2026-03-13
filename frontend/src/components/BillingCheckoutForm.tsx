'use client';

import { useMemo, useState } from 'react';

import { CheckoutProvider, ExpressCheckoutElement, PaymentElement, useCheckout } from '@stripe/react-stripe-js/checkout';
import { loadStripe } from '@stripe/stripe-js';
import type { StripeExpressCheckoutElementReadyEvent } from '@stripe/stripe-js';

interface BillingCheckoutFormProps {
  clientSecret: string;
}

let stripePromise: ReturnType<typeof loadStripe> | null = null;

function getStripePromise() {
  if (stripePromise) {
    return stripePromise;
  }

  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!publishableKey) {
    return null;
  }

  stripePromise = loadStripe(publishableKey);
  return stripePromise;
}

function BillingCheckoutContent() {
  const checkoutState = useCheckout();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [hasWallets, setHasWallets] = useState(true);

  async function handleMainSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (checkoutState.type !== 'success') {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const result = await checkoutState.checkout.confirm({
        redirect: 'if_required',
      });

      if (result.type === 'error') {
        setSubmitError('Unable to confirm subscription. Please check your payment details and try again.');
        return;
      }

      window.location.assign('/billing?success=true');
    } catch {
      setSubmitError('Unable to confirm subscription. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleExpressConfirm(event: Parameters<NonNullable<React.ComponentProps<typeof ExpressCheckoutElement>['onConfirm']>>[0]) {
    if (checkoutState.type !== 'success') {
      return;
    }

    setWalletError(null);

    try {
      const result = await checkoutState.checkout.confirm({
        expressCheckoutConfirmEvent: event,
        redirect: 'if_required',
      });

      if (result.type === 'error') {
        setWalletError('Wallet checkout was unavailable. Try the standard payment form below.');
        return;
      }

      window.location.assign('/billing?success=true');
    } catch {
      setWalletError('Wallet checkout was unavailable. Try the standard payment form below.');
    }
  }

  function handleExpressReady(event: StripeExpressCheckoutElementReadyEvent) {
    setHasWallets(Boolean(event.availablePaymentMethods));
  }

  if (checkoutState.type === 'loading') {
    return (
      <div className="billing-checkout-loading" aria-live="polite">
        <div className="billing-loading-line billing-loading-line-title" />
        <div className="billing-loading-line billing-loading-line-body" />
        <div className="billing-loading-panel" />
      </div>
    );
  }

  if (checkoutState.type === 'error') {
    return <p className="billing-checkout-error">Unable to initialize billing checkout. Please try again in a moment.</p>;
  }

  return (
    <form className="billing-checkout-form" onSubmit={(event) => void handleMainSubmit(event)}>
      {hasWallets ? (
        <div className="billing-wallet-section">
          <ExpressCheckoutElement
            options={{
              buttonHeight: 48,
              paymentMethodOrder: ['apple_pay', 'link'],
              buttonType: {
                applePay: 'subscribe',
              },
              buttonTheme: {
                applePay: 'black',
              },
              paymentMethods: {
                applePay: 'always',
              },
              layout: {
                maxColumns: 1,
                maxRows: 2,
                overflow: 'never',
              },
            }}
            onReady={handleExpressReady}
            onConfirm={(event) => void handleExpressConfirm(event)}
          />
          {walletError ? <p className="billing-checkout-error">{walletError}</p> : null}
        </div>
      ) : (
        <p className="billing-wallet-note">Apple Pay or Link appear automatically when this device and domain support them.</p>
      )}

      <div className="billing-divider">
        <span>Or pay with card</span>
      </div>

      <div className="billing-payment-element">
        <PaymentElement
          options={{
            layout: 'tabs',
          }}
        />
      </div>

      {submitError ? <p className="billing-checkout-error">{submitError}</p> : null}

      <button type="submit" className="billing-primary-button" disabled={isSubmitting}>
        {isSubmitting ? 'Starting subscription...' : 'Subscribe to Pro'}
      </button>
    </form>
  );
}

export function BillingCheckoutForm({ clientSecret }: BillingCheckoutFormProps) {
  const stripe = useMemo(() => getStripePromise(), []);

  if (!stripe) {
    return <p className="billing-checkout-error">Billing is not configured for this environment yet.</p>;
  }

  return (
    <CheckoutProvider
      stripe={stripe}
      options={{
        clientSecret,
        elementsOptions: {
          appearance: {
            theme: 'stripe',
            variables: {
              colorPrimary: '#0b6bcb',
              borderRadius: '16px',
            },
          },
        },
      }}
    >
      <BillingCheckoutContent />
    </CheckoutProvider>
  );
}
