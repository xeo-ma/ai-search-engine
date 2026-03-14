'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import type { AccountStateResponse } from '../lib/api-client';
import { createBillingPortalSession, createCustomCheckoutSession, fetchAccountState } from '../lib/api-client';
import { BillingCheckoutForm } from './BillingCheckoutForm';

interface BillingPageProps {
  initialAccountState: AccountStateResponse;
  billingState: string | null;
}

const PRO_BENEFITS = [
  'Deep search for broader retrieval on difficult queries',
  'Sync preferences across your devices',
  'Managed billing and invoice history through Stripe',
];

function formatBillingDate(dateString: string | null): string | null {
  if (!dateString) {
    return null;
  }

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export function BillingPage({ initialAccountState, billingState }: BillingPageProps) {
  const [accountState, setAccountState] = useState(initialAccountState);
  const [checkoutClientSecret, setCheckoutClientSecret] = useState<string | null>(null);
  const [checkoutStatus, setCheckoutStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [billingActionError, setBillingActionError] = useState<string | null>(null);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [isRefreshingPlan, setIsRefreshingPlan] = useState(false);

  const isAuthenticated = accountState.authenticated;
  const isPro = accountState.plan === 'pro';
  const isFree = accountState.plan === 'free';
  const cancellationDate = formatBillingDate(accountState.currentPeriodEnd);
  const renewalDate = isPro && !accountState.cancelAtPeriodEnd ? cancellationDate : null;
  const isAwaitingProConfirmation = billingState === 'success' && isFree;
  const didConfirmationTimeout = billingState === 'success' && isFree && !isRefreshingPlan;
  const shouldShowCheckout = isAuthenticated && isFree && !isAwaitingProConfirmation;

  useEffect(() => {
    if (!shouldShowCheckout) {
      setCheckoutStatus('idle');
      setCheckoutClientSecret(null);
      setCheckoutError(null);
      return;
    }

    let isMounted = true;

    async function loadCheckout() {
      setCheckoutStatus('loading');
      setCheckoutError(null);

      try {
        const { clientSecret } = await createCustomCheckoutSession();
        if (!isMounted) {
          return;
        }
        setCheckoutClientSecret(clientSecret);
        setCheckoutStatus('ready');
      } catch (error) {
        if (!isMounted) {
          return;
        }
        setCheckoutStatus('error');
        setCheckoutError(error instanceof Error ? error.message : 'Unable to initialize billing checkout.');
      }
    }

    void loadCheckout();

    return () => {
      isMounted = false;
    };
  }, [shouldShowCheckout]);

  useEffect(() => {
    if (billingState !== 'success' || isPro) {
      return;
    }

    let isMounted = true;
    let cancelled = false;

    async function pollAccountState() {
      setIsRefreshingPlan(true);

      for (let attempt = 0; attempt < 15; attempt += 1) {
        try {
          const nextAccountState = await fetchAccountState();
          if (!isMounted) {
            return;
          }
          setAccountState(nextAccountState);
          if (nextAccountState.plan === 'pro') {
            break;
          }
        } catch {
          if (!isMounted) {
            return;
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));
        if (cancelled) {
          return;
        }
      }

      if (isMounted) {
        setIsRefreshingPlan(false);
      }
    }

    void pollAccountState();

    return () => {
      isMounted = false;
      cancelled = true;
    };
  }, [billingState, isPro]);

  const statusState = useMemo(() => {
    if (billingState === 'success' && isFree) {
      return {
        tone: 'pending' as const,
        title: 'Payment received',
        message: isRefreshingPlan
          ? 'Pro will activate automatically in a moment. You do not need to do anything else.'
          : 'Pro has not been confirmed yet, but billing should update automatically shortly.',
      };
    }

    if (billingState === 'cancelled') {
      return {
        tone: 'cancelled' as const,
        title: 'Checkout canceled',
        message: 'Nothing changed on your account. You can resume the upgrade anytime from this page.',
      };
    }

    return null;
  }, [billingState, isFree, isRefreshingPlan]);

  async function handleManageBilling() {
    setBillingActionError(null);
    setIsOpeningPortal(true);

    try {
      const { url } = await createBillingPortalSession();
      window.location.assign(url);
    } catch (error) {
      setBillingActionError(error instanceof Error ? error.message : 'Unable to open billing portal.');
    } finally {
      setIsOpeningPortal(false);
    }
  }

  return (
    <main className="billing-layout">
      <section className="billing-shell">
        <header className="billing-header">
          <Link href="/" className="billing-back-link">
            ← Back to search
          </Link>
          <p className="billing-eyebrow">Billing</p>
          <h1>Subscription and billing</h1>
          <p className="billing-subcopy">
            Manage your subscription, understand what Pro unlocks, and securely update your payment details.
          </p>
        </header>

        {billingState === 'success' && isPro ? (
          <div className="billing-status-banner billing-status-success">
            <div className="stack">
              <strong>Lens Pro is active</strong>
              <span>Deep Search is now available for broader retrieval on difficult queries. You can manage billing later from this page.</span>
            </div>
            <div className="billing-status-actions">
              <Link className="billing-secondary-button billing-secondary-link" href="/">
                Return to search
              </Link>
              <button
                type="button"
                className="billing-secondary-button"
                disabled={isOpeningPortal}
                onClick={() => void handleManageBilling()}
              >
                {isOpeningPortal ? 'Opening portal...' : 'Manage billing'}
              </button>
            </div>
          </div>
        ) : statusState ? (
          <div className={`billing-status-banner billing-status-${statusState.tone}`}>
            <div className="stack">
              {statusState.tone === 'pending' ? <span className="billing-status-spinner" aria-hidden="true" /> : null}
              <strong>{statusState.title}</strong>
              <span>{statusState.message}</span>
              {didConfirmationTimeout ? (
                <span className="billing-status-hint">If this takes longer than expected, return to search and check back in a moment.</span>
              ) : null}
            </div>
            {statusState.tone === 'pending' ? (
              <div className="billing-status-actions">
                <Link className="billing-secondary-button billing-secondary-link" href="/">
                  Return to search
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="billing-plan-grid">
          <article className="billing-card">
            <div className="billing-card-header">
              <div>
                <p className="billing-card-label">Current plan</p>
                <h2>{isPro ? 'Pro plan' : isAwaitingProConfirmation ? 'Confirming Pro' : 'Free plan'}</h2>
              </div>
              <span className={`billing-plan-pill${isPro ? ' is-pro' : ''}`}>
                {isPro ? 'Active' : isAwaitingProConfirmation ? 'Updating' : 'Current Plan'}
              </span>
            </div>
            <p className="billing-card-copy">
              {isAuthenticated
                ? isPro
                  ? 'Your account is on the Pro plan. Deep Search can gather a broader candidate set before ranking.'
                  : isAwaitingProConfirmation
                    ? 'Your payment was received. Pro access is being confirmed through billing now.'
                    : 'Your account is on the Free plan. Pro adds deeper retrieval for harder queries.'
                : 'Sign in to view or change the billing state for your account.'}
            </p>
            {isAuthenticated && accountState.email ? <p className="billing-card-meta">Signed in as {accountState.email}</p> : null}
            {isAuthenticated && isPro && accountState.subscriptionStatus ? (
              <p className="billing-card-meta">Subscription status: {accountState.subscriptionStatus}</p>
            ) : null}
            {isAuthenticated && isPro && accountState.cancelAtPeriodEnd && cancellationDate ? (
              <p className="billing-card-meta">
                Cancellation scheduled. Pro access remains active until {cancellationDate}.
              </p>
            ) : null}
            {isAuthenticated && isPro && renewalDate ? (
              <p className="billing-card-meta">Renews on {renewalDate}.</p>
            ) : null}
            {isAuthenticated && isFree && !isAwaitingProConfirmation && accountState.freeSearchesRemaining !== null ? (
              <p className="billing-card-meta">{accountState.freeSearchesRemaining} free searches remaining today.</p>
            ) : null}
            {isAuthenticated && isPro ? (
              <button type="button" className="billing-secondary-button" disabled={isOpeningPortal} onClick={() => void handleManageBilling()}>
                {isOpeningPortal ? 'Opening portal...' : 'Manage billing'}
              </button>
            ) : null}
            {!isAuthenticated ? (
              <Link className="billing-primary-button billing-primary-link" href="/sign-in?callbackUrl=%2Fbilling">
                Sign in to continue
              </Link>
            ) : null}
          </article>

          <article className="billing-card billing-card-accent">
            <div className="billing-card-header">
              <div>
                <p className="billing-card-label">Pro monthly</p>
                <div className="billing-price-lockup">
                  <h2>$20</h2>
                  <span>/month</span>
                </div>
              </div>
            </div>
            <ul className="billing-benefits">
              {PRO_BENEFITS.map((benefit) => (
                <li key={benefit}>{benefit}</li>
              ))}
            </ul>
            {isAuthenticated && isFree ? <p className="billing-card-meta">Upgrade in-app with wallet support or the standard payment form below.</p> : null}
          </article>
        </div>

        {shouldShowCheckout ? (
          <section className="billing-card billing-checkout-card">
            <div className="billing-section-header">
              <div>
                <p className="billing-card-label">Checkout</p>
                <h2>Upgrade to Pro</h2>
              </div>
            </div>
            <p className="billing-card-copy">Choose a payment method below.</p>
            {checkoutStatus === 'loading' ? (
              <div className="billing-checkout-loading" aria-live="polite">
                <div className="billing-loading-line billing-loading-line-title" />
                <div className="billing-loading-panel" />
              </div>
            ) : null}
            {checkoutStatus === 'error' ? <p className="billing-checkout-error">{checkoutError ?? 'Unable to initialize billing checkout.'}</p> : null}
            {checkoutStatus === 'ready' && checkoutClientSecret ? <BillingCheckoutForm clientSecret={checkoutClientSecret} /> : null}
          </section>
        ) : null}

        {billingActionError ? <p className="billing-checkout-error">{billingActionError}</p> : null}

        {!isAuthenticated ? (
          <section className="billing-card billing-note-card">
            <p className="billing-card-copy">You need an account before starting a subscription so billing and Pro entitlements can stay linked to the correct user.</p>
          </section>
        ) : null}
      </section>
    </main>
  );
}
