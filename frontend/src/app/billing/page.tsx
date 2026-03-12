import { BillingPage } from '../../components/BillingPage';
import { getAuthSession } from '../../lib/auth';
import { getSearchAccountState } from '../../lib/account-state';

interface BillingRouteProps {
  searchParams?: {
    billing?: string;
  };
}

export default async function BillingRoute({ searchParams }: BillingRouteProps) {
  const session = await getAuthSession();
  const accountState = await getSearchAccountState(session?.user?.id);
  const billingState = typeof searchParams?.billing === 'string' ? searchParams.billing : null;

  return <BillingPage initialAccountState={accountState} billingState={billingState} />;
}
