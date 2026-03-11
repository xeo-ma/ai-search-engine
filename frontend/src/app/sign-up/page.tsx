import { AuthShell } from '../../components/AuthShell';
import { SignUpForm } from '../../components/SignUpForm';

interface SignUpPageProps {
  searchParams?: {
    callbackUrl?: string;
  };
}

export default function SignUpPage({ searchParams }: SignUpPageProps) {
  const callbackUrl = searchParams?.callbackUrl || '/';

  return (
    <AuthShell
      eyebrow="Account"
      title="Create account"
      description="Create an account to sync preferences, manage billing, and unlock Pro access."
    >
      <SignUpForm callbackUrl={callbackUrl} />
    </AuthShell>
  );
}
