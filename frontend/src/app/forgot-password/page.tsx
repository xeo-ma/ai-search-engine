import { AuthShell } from '../../components/AuthShell';
import { ForgotPasswordForm } from '../../components/ForgotPasswordForm';

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      eyebrow="Account"
      title="Reset your password"
      description="Enter your email and we’ll send a secure reset link if an account exists."
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
