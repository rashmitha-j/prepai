import { useState } from 'react';
import { knowledgeApi } from '../../api';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import ErrorState from '../../components/ui/ErrorState';
import Icon from '../../components/ui/Icon';
import PageHeader from '../../components/ui/PageHeader';
import { SkeletonCards } from '../../components/ui/Skeleton';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { getErrorMessage } from '../../utils/errors';

const STATUS_TONE = { ingested: 'good', pending: 'mid', failed: 'bad' };

export default function Knowledge() {
  useDocumentTitle('Knowledge base');
  const docs = useAsync(() => knowledgeApi.list().then((r) => r.documents), []);
  const status = useAsync(() => knowledgeApi.status(), []);
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  const search = async (e) => {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setSearching(true);
    setSearchError('');
    try {
      setResults(await knowledgeApi.search({ query: query.trim(), topK: 5, ...(topic ? { topic } : {}) }));
    } catch (err) {
      setSearchError(getErrorMessage(err));
    } finally {
      setSearching(false);
    }
  };

  const index = status.data?.index;
  return (
    <div className="stack-lg">
      <PageHeader
        title="Knowledge base"
        description="Curated interview study notes. PrepAI retrieves the most relevant passages from here to ground questions, feedback and roadmaps."
      />

      <section className="card stack" aria-labelledby="search-heading">
        <h2 id="search-heading" className="section-title">Search the notes</h2>
        <form className="row" onSubmit={search}>
          <input
            className="input grow"
            style={{ flexBasis: 240 }}
            placeholder="e.g. how does a B+ tree index work"
            value={query}
            maxLength={500}
            aria-label="Search query"
            onChange={(e) => setQuery(e.target.value)}
          />
          <select className="select" style={{ width: 'auto' }} value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="Topic">
            <option value="">All topics</option>
            {[...new Set((docs.data || []).map((d) => d.topic))].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <Button type="submit" loading={searching} disabled={query.trim().length < 2}>
            <Icon name="search" size={16} /> Search
          </Button>
        </form>
        {searchError ? <Alert variant="error">{searchError}</Alert> : null}
        {results ? (
          results.results.length ? (
            <div className="stack">
              <p className="xs muted">
                Top {results.results.length} passages by cosine similarity ({results.embedding}).
              </p>
              {results.results.map((r) => (
                <article key={r.id} className="card card-tight" style={{ background: 'var(--surface-sunken)', border: 0 }}>
                  <div className="row-between" style={{ marginBottom: 6 }}>
                    <strong className="small">{r.section || r.title}</strong>
                    <span className="row" style={{ gap: 6 }}>
                      <Badge>{r.topic}</Badge>
                      <Badge tone="accent">{r.score.toFixed(2)}</Badge>
                    </span>
                  </div>
                  <p className="small" style={{ whiteSpace: 'pre-line' }}>
                    {r.text.length > 700 ? `${r.text.slice(0, 700)}…` : r.text}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className="small muted">No relevant passages found. Try different words.</p>
          )
        ) : null}
      </section>

      <section aria-labelledby="docs-heading" className="stack">
        <div className="row-between">
          <h2 id="docs-heading" className="section-title" style={{ marginBottom: 0 }}>Documents</h2>
          {index && !index.error ? (
            <span className="xs muted">
              Vector index: {index.chunks} chunks in {index.store}, embeddings {index.embedding}
            </span>
          ) : index?.error ? (
            <span className="xs" style={{ color: 'var(--mid)' }}>Vector index unavailable: {index.error}</span>
          ) : null}
        </div>
        {docs.loading && !docs.data ? (
          <SkeletonCards count={3} height={56} />
        ) : docs.error ? (
          <ErrorState error={docs.error} onRetry={docs.reload} />
        ) : !docs.data.length ? (
          <Alert variant="info">No documents yet. Run <code>npm run seed</code> to load the knowledge base.</Alert>
        ) : (
          <div className="grid-3">
            {docs.data.map((d) => (
              <div key={d.docId} className="card card-tight stack-sm">
                <div className="row-between">
                  <strong className="small">{d.title}</strong>
                  <Badge tone={STATUS_TONE[d.ingestionStatus]}>{d.ingestionStatus === 'ingested' ? `${d.chunkCount} chunks` : d.ingestionStatus}</Badge>
                </div>
                <span className="xs muted">
                  {d.wordCount?.toLocaleString()} words, topic <code>{d.topic}</code>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
