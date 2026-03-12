'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { signOut } from 'next-auth/react';

import type { AccountStateResponse } from '../lib/api-client';
import { createBillingPortalSession, createCustomCheckoutSession, fetchAccountState } from '../lib/api-client';
import { BillingCheckoutForm } from './BillingCheckoutForm';

interface BillingPageProps {
  initialAccountState: AccountStateResponse;
  billingState: string | null;
}

const PRO_BENEFITS = [
  'Deep search across a broader retrieval set',
  'Server-enforced Pro entitlement and preference sync',
  'Managed billing and invoice history through Stripe',
];

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
  const shouldShowCheckout = isAuthenticated && isFree;

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
    if (billingState !== 'return' || isPro) {
      return;
    }

    let isMounted = true;
    let cancelled = false;

    async function pollAccountState() {
      setIsRefreshingPlan(true);

      for (let attempt = 0; attempt < 5; attempt += 1) {
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

        await new Promise((resolve) => setTimeout(resolve, 1800));
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

  const statusMessage = useMemo(() => {
    if (billingState === 'return' && isPro) {
      return 'Pro is now active. Billing is managed through Stripe.';
    }

    if (billingState === 'return' && isFree) {
      return isRefreshingPlan
        ? 'Payment submitted. Waiting for subscription confirmation from billing...'
        : 'Payment was submitted, but Pro has not been confirmed yet. Refresh in a moment if needed.';
    }

    if (billingState === 'cancelled') {
      return 'Checkout was canceled. You can resume it anytime from this page.';
    }

    if (billingState === 'success' && isPro) {
      return 'Billing completed successfully.';
    }

    return null;
  }, [billingState, isFree, isPro, isRefreshingPlan]);

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
          <p className="billing-subcopy">Manage your subscription, upgrade your plan, and securely update your payment details.</p>
        </header>

        {statusMessage ? <div className="billing-status-banner">{statusMessage}</div> : null}

        <div className="billing-plan-grid">
          <article className="billing-card">
            <div className="billing-card-header">
              <div>
                <p className="billing-card-label">Current plan</p>
                <h2>{isPro ? 'Pro' : 'Free'}</h2>
              </div>
              <span className={`billing-plan-pill${isPro ? ' is-pro' : ''}`}>{isPro ? 'Active' : 'Current Plan'}</span>
            </div>
            <p className="billing-card-copy">
              {isAuthenticated
                ? isPro
                  ? 'Your account is on Pro and managed through Stripe.'
                  : 'Your account is currently on the free plan.'
                : 'Sign in to view or change the billing state for your account.'}
            </p>
            {isAuthenticated && accountState.email ? <p className="billing-card-meta">Signed in as {accountState.email}</p> : null}
            {isAuthenticated && isFree && accountState.freeSearchesRemaining !== null ? (
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
            <p className="billing-card-copy">Use available wallet options when offered, or choose a standard payment method below.</p>
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

        {isAuthenticated ? (
          <div className="billing-account-actions">
            <button type="button" className="billing-tertiary-button" onClick={() => void signOut({ callbackUrl: '/' })}>
              Sign out
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
