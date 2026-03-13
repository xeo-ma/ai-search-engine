import { AuthShell } from '../../components/AuthShell';
import { ForgotPasswordForm } from '../../components/ForgotPasswordForm';

interface ForgotPasswordPageProps {
  searchParams?: {
    email?: string;
  };
}

export default function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const initialEmail = searchParams?.email ?? '';

  return (
    <AuthShell
      eyebrow="Account"
      title="Reset your password"
      description="Enter your email and we’ll send a secure reset link if an account exists."
    >
      <ForgotPasswordForm initialEmail={initialEmail} />
    </AuthShell>
  );
}
