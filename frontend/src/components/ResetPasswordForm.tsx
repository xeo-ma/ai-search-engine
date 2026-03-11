'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';

interface ResetPasswordFormProps {
  token: string | null;
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

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const confirmPasswordInputRef = useRef<HTMLInputElement>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = useMemo(() => {
    return Boolean(token) && password.length >= 8 && password === confirmPassword;
  }, [confirmPassword, password, token]);

  function focusPasswordInput(input: HTMLInputElement | null): void {
    if (!input) {
      return;
    }

    input.focus({ preventScroll: true });
    const cursor = input.value.length;
    input.setSelectionRange(cursor, cursor);
  }

  function togglePasswordVisibility(): void {
    setShowPassword((current) => !current);
    requestAnimationFrame(() => focusPasswordInput(passwordInputRef.current));
  }

  function toggleConfirmPasswordVisibility(): void {
    setShowConfirmPassword((current) => !current);
    requestAnimationFrame(() => focusPasswordInput(confirmPasswordInputRef.current));
  }

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
          <span className="auth-input-shell">
            <input
              key={showPassword ? 'reset-password-visible' : 'reset-password-hidden'}
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

        <label className="auth-field">
          <span>Confirm password</span>
          <span className="auth-input-shell">
            <input
              key={showConfirmPassword ? 'reset-confirm-visible' : 'reset-confirm-hidden'}
              ref={confirmPasswordInputRef}
              type={showConfirmPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Repeat your new password"
              required
              minLength={8}
            />
            <button
              type="button"
              className="auth-input-toggle"
              aria-label={showConfirmPassword ? 'Hide password confirmation' : 'Show password confirmation'}
              aria-pressed={showConfirmPassword}
              onClick={toggleConfirmPasswordVisibility}
            >
              <EyeIcon hidden={showConfirmPassword} />
            </button>
          </span>
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
