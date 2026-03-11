'use client';

import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useMemo, useState } from 'react';

type SignInMode = 'password' | 'magic';

interface SignInFormProps {
  callbackUrl: string;
}

export function SignInForm({ callbackUrl }: SignInFormProps) {
  const [mode, setMode] = useState<SignInMode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = useMemo(() => {
    if (!email.trim()) {
      return false;
    }

    if (mode === 'password') {
      return password.length > 0;
    }

    return true;
  }, [email, mode, password]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      if (mode === 'password') {
        const result = await signIn('credentials', {
          email: email.trim(),
          password,
          callbackUrl,
          redirect: false,
        });

        if (!result || result.error) {
          setErrorMessage('Incorrect email or password.');
          return;
        }

        window.location.assign(result.url ?? callbackUrl);
        return;
      }

      const result = await signIn('email', {
        email: email.trim(),
        callbackUrl,
        redirect: false,
      });

      if (!result || result.error) {
        setErrorMessage('Magic link sign-in is unavailable right now.');
        return;
      }

      setStatusMessage('Check your email for a sign-in link.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-form-stack">
      <div className="auth-mode-toggle" role="tablist" aria-label="Sign in method">
        <button
          type="button"
          className={`auth-mode-toggle-button${mode === 'password' ? ' is-active' : ''}`}
          aria-selected={mode === 'password'}
          onClick={() => setMode('password')}
        >
          Password
        </button>
        <button
          type="button"
          className={`auth-mode-toggle-button${mode === 'magic' ? ' is-active' : ''}`}
          aria-selected={mode === 'magic'}
          onClick={() => setMode('magic')}
        >
          Magic link
        </button>
      </div>

      <form className="auth-form-stack" onSubmit={(event) => void handleSubmit(event)}>
        <label className="auth-field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
          />
        </label>

        {mode === 'password' ? (
          <label className="auth-field">
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              required
            />
          </label>
        ) : (
          <p className="auth-form-hint">We’ll email you a one-time sign-in link.</p>
        )}

        {errorMessage ? <p className="auth-form-error">{errorMessage}</p> : null}
        {statusMessage ? <p className="auth-form-success">{statusMessage}</p> : null}

        <button type="submit" className="auth-submit-button" disabled={!canSubmit || isSubmitting}>
          {isSubmitting ? (mode === 'password' ? 'Signing in...' : 'Sending link...') : mode === 'password' ? 'Sign in' : 'Send magic link'}
        </button>
      </form>

      <div className="auth-inline-links">
        <Link href="/forgot-password">Forgot password?</Link>
        <Link href={`/sign-up?callbackUrl=${encodeURIComponent(callbackUrl)}`}>Create account</Link>
      </div>
    </div>
  );
}
