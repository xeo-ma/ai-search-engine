import { AuthShell } from '../../components/AuthShell';
import { SignInForm } from '../../components/SignInForm';

interface SignInPageProps {
  searchParams?: {
    callbackUrl?: string;
  };
}

export default function SignInPage({ searchParams }: SignInPageProps) {
  const callbackUrl = searchParams?.callbackUrl || '/';

  return (
    <AuthShell
      eyebrow="Account"
      title="Sign in"
      description="Access your saved account state, billing, and deep search settings."
    >
      <SignInForm callbackUrl={callbackUrl} />
    </AuthShell>
  );
}
