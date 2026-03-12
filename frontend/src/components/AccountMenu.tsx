interface AccountMenuProps {
  authenticated: boolean;
  email: string | null;
  pendingAccountAction: null | 'signin' | 'signout' | 'billing';
  accountActionError: string | null;
  onSignIn: () => void;
  onBilling: () => void;
  onSignOut: () => void;
}

export function AccountMenu({
  authenticated,
  email,
  pendingAccountAction,
  accountActionError,
  onSignIn,
  onBilling,
  onSignOut,
}: AccountMenuProps) {
  return (
    <div className="account-menu" role="menu" aria-label="Account menu">
      <div className="account-menu-section">
        <p className="account-menu-label">Account</p>
        {authenticated && email ? <p className="account-menu-help">Signed in as {email}</p> : null}
        {authenticated ? (
          <button type="button" className="account-menu-action" disabled={pendingAccountAction !== null} onClick={onBilling}>
            {pendingAccountAction === 'billing' ? 'Opening billing...' : 'Billing'}
          </button>
        ) : (
          <button type="button" className="account-menu-action" disabled={pendingAccountAction !== null} onClick={onSignIn}>
            {pendingAccountAction === 'signin' ? 'Opening sign in...' : 'Sign in'}
          </button>
        )}
        {authenticated ? (
          <button
            type="button"
            className="account-menu-action account-menu-action-secondary"
            disabled={pendingAccountAction !== null}
            onClick={onSignOut}
          >
            {pendingAccountAction === 'signout' ? 'Signing out...' : 'Sign out'}
          </button>
        ) : null}
        {accountActionError ? <p className="account-menu-error">{accountActionError}</p> : null}
      </div>
    </div>
  );
}
