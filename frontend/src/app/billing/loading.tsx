export default function BillingLoading() {
  return (
    <main className="billing-layout">
      <section className="billing-shell">
        <div className="billing-header billing-loading-block">
          <div className="billing-loading-line billing-loading-line-short" />
          <div className="billing-loading-line billing-loading-line-title" />
          <div className="billing-loading-line billing-loading-line-body" />
        </div>
        <div className="billing-plan-grid">
          <div className="billing-card billing-loading-card" />
          <div className="billing-card billing-loading-card" />
        </div>
        <div className="billing-card billing-loading-card billing-loading-card-tall" />
      </section>
    </main>
  );
}
