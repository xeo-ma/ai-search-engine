'use client';

import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useMemo, useRef, useState } from 'react';

type SignInMode = 'password' | 'magic';

interface SignInFormProps {
  callbackUrl: string;
  initialEmail?: string;
}

function EyeIcon({ hidden = false }: { hidden?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1.8 10s3-5.2 8.2-5.2 8.2 5.2 8.2 5.2-3 5.2-8.2 5.2S1.8 10 1.8 10Z" />
      <circle cx="10" cy="10" r="2.5" />
      {hidden ? <path d="M3.2 16.8 16.8 3.2" /> : null}
    </svg>
  );
}

export function SignInForm({ callbackUrl, initialEmail = '' }: SignInFormProps) {
  const [mode, setMode] = useState<SignInMode>('password');
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const passwordInputRef = useRef<HTMLInputElement>(null);
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

  function togglePasswordVisibility(): void {
    setShowPassword((current) => !current);

    requestAnimationFrame(() => {
      const input = passwordInputRef.current;
      if (!input) {
        return;
      }

      input.focus({ preventScroll: true });
      const cursor = input.value.length;
      input.setSelectionRange(cursor, cursor);
    });
  }

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
            <span className="auth-field-header">
              <span>Password</span>
              <Link href={email.trim() ? `/forgot-password?email=${encodeURIComponent(email.trim())}` : '/forgot-password'}>
                Forgot password?
              </Link>
            </span>
            <span className="auth-input-shell">
              <input
                key={showPassword ? 'sign-in-password-visible' : 'sign-in-password-hidden'}
                ref={passwordInputRef}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                required
              />
              <button
                type="button"
                className="auth-input-toggle"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                onClick={togglePasswordVisibility}
              >
                <EyeIcon hidden={showPassword} />
              </button>
            </span>
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
        <span>Don&apos;t have an account?</span>
        <Link href={`/sign-up?callbackUrl=${encodeURIComponent(callbackUrl)}`}>Create one</Link>
      </div>
    </div>
  );
}
