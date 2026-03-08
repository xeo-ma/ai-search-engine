interface SummaryCardProps {
  summary: string;
  sources: Array<{ title: string; url: string }>;
}

export function SummaryCard({ summary, sources }: SummaryCardProps) {
  return (
    <section className="card stack">
      <h2>AI Summary</h2>
      <p>{summary}</p>
      {sources.length > 0 ? (
        <div className="stack">
          <strong>Sources</strong>
          {sources.map((source) => (
            <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
              {source.title}
            </a>
          ))}
        </div>
      ) : (
        <p className="muted">No citations yet.</p>
      )}
    </section>
  );
}
