import type { SummaryClaim } from '../lib/api-client';
import { EvidenceItem } from './EvidenceItem';

interface ClaimEvidenceListProps {
  claims: SummaryClaim[];
}

export function ClaimEvidenceList({ claims }: ClaimEvidenceListProps) {
  if (claims.length === 0) {
    return <p className="muted">No evidence available.</p>;
  }

  return (
    <div className="claim-list stack">
      {claims.map((claim, index) => (
        <section key={claim.id} className="claim-row stack">
          <div className="claim-heading">
            <span className="claim-dot" aria-hidden="true" />
            <p className="claim-label">Fact {index + 1}</p>
          </div>
          <p className="claim-text">{claim.text}</p>
          {claim.evidence.length > 0 ? (
            <div className="claim-evidence stack">
              <div className="evidence-list stack">
                {claim.evidence.slice(0, 3).map((source) => (
                  <EvidenceItem
                    key={`${claim.id}-${source.id ?? source.url}-${source.sourceIndex ?? 0}`}
                    source={source}
                  />
                ))}
              </div>
            </div>
          ) : (
            <p className="muted">No evidence available for this claim.</p>
          )}
        </section>
      ))}
    </div>
  );
}
