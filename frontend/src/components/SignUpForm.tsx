'use client';

import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useMemo, useState } from 'react';

interface SignUpFormProps {
  callbackUrl: string;
}

export function SignUpForm({ callbackUrl }: SignUpFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = useMemo(() => {
    return email.trim().length > 0 && password.length >= 8;
  }, [email, password]);

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
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 8 characters"
            required
            minLength={8}
          />
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
