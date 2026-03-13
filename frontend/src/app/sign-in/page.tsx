import { AuthShell } from '../../components/AuthShell';
import { SignInForm } from '../../components/SignInForm';

interface SignInPageProps {
  searchParams?: {
    callbackUrl?: string;
    email?: string;
  };
}

export default function SignInPage({ searchParams }: SignInPageProps) {
  const callbackUrl = searchParams?.callbackUrl || '/';
  const initialEmail = searchParams?.email ?? '';

  return (
    <AuthShell
      eyebrow="Account"
      title="Sign in"
      description="Access your saved account state, billing, and deep search settings."
    >
      <SignInForm callbackUrl={callbackUrl} initialEmail={initialEmail} />
    </AuthShell>
  );
}
