'use client';

import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useMemo, useRef, useState } from 'react';

interface SignUpFormProps {
  callbackUrl: string;
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

export function SignUpForm({ callbackUrl }: SignUpFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = useMemo(() => {
    return email.trim().length > 0 && password.length >= 8;
  }, [email, password]);

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

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim() || undefined,
          email: email.trim(),
          password,
        }),
      });

      if (!response.ok) {
        const data = (await response.json()) as { message?: string };
        setErrorMessage(data.message ?? 'Unable to create account.');
        return;
      }

      const result = await signIn('credentials', {
        email: email.trim(),
        password,
        callbackUrl,
        redirect: false,
      });

      if (!result || result.error) {
        window.location.assign(`/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`);
        return;
      }

      window.location.assign(result.url ?? callbackUrl);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-form-stack">
      <form className="auth-form-stack" onSubmit={(event) => void handleSubmit(event)}>
        <label className="auth-field">
          <span>Name</span>
          <input
            type="text"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Optional"
          />
        </label>

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

        <label className="auth-field">
          <span>Password</span>
          <span className="auth-input-shell">
            <input
              key={showPassword ? 'sign-up-password-visible' : 'sign-up-password-hidden'}
              ref={passwordInputRef}
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              required
              minLength={8}
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

        <p className="auth-form-hint">Passwords must be at least 8 characters long.</p>
        {errorMessage ? <p className="auth-form-error">{errorMessage}</p> : null}

        <button type="submit" className="auth-submit-button" disabled={!canSubmit || isSubmitting}>
          {isSubmitting ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <div className="auth-inline-links">
        <span>Already have an account?</span>
        <Link href={`/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`}>Sign in</Link>
      </div>
    </div>
  );
}
