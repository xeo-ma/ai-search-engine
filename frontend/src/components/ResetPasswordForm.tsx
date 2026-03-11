'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

interface ResetPasswordFormProps {
  token: string | null;
}

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = useMemo(() => {
    return Boolean(token) && password.length >= 8 && password === confirmPassword;
  }, [confirmPassword, password, token]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canSubmit || !token) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          token,
          password,
        }),
      });

      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        setErrorMessage(data.message ?? 'Unable to reset password.');
        return;
      }

      setStatusMessage(data.message ?? 'Password updated successfully.');
      setPassword('');
      setConfirmPassword('');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="auth-form-stack">
        <p className="auth-form-error">This reset link is missing a token.</p>
        <div className="auth-inline-links">
          <Link href="/forgot-password">Request a new reset link</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-form-stack">
      <form className="auth-form-stack" onSubmit={(event) => void handleSubmit(event)}>
        <label className="auth-field">
          <span>New password</span>
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

        <label className="auth-field">
          <span>Confirm password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Repeat your new password"
            required
            minLength={8}
          />
        </label>

        <p className="auth-form-hint">Choose a new password you haven’t used recently.</p>
        {password && confirmPassword && password !== confirmPassword ? (
          <p className="auth-form-error">Passwords do not match.</p>
        ) : null}
        {errorMessage ? <p className="auth-form-error">{errorMessage}</p> : null}
        {statusMessage ? <p className="auth-form-success">{statusMessage}</p> : null}

        <button type="submit" className="auth-submit-button" disabled={!canSubmit || isSubmitting}>
          {isSubmitting ? 'Updating password...' : 'Reset password'}
        </button>
      </form>

      <div className="auth-inline-links">
        <Link href="/sign-in">Back to sign in</Link>
      </div>
    </div>
  );
}
