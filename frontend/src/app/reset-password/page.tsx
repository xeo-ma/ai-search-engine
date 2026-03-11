import { AuthShell } from '../../components/AuthShell';
import { ResetPasswordForm } from '../../components/ResetPasswordForm';

interface ResetPasswordPageProps {
  searchParams?: {
    token?: string;
  };
}

export default function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  return (
    <AuthShell
      eyebrow="Account"
      title="Choose a new password"
      description="Set a new password for your account."
    >
      <ResetPasswordForm token={searchParams?.token ?? null} />
    </AuthShell>
  );
}
