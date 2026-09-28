import Alert from './ui/Alert';
import Badge from './ui/Badge';

/** Makes it explicit whether results came from the AI model or keyword fallback. */
export function AnalysisModeBadge({ mode }) {
  if (mode === 'ai') return <Badge tone="accent" title="Structured by the AI model and validated against a schema">AI analysis</Badge>;
  if (mode === 'heuristic') return <Badge tone="mid" title="The AI provider was unavailable; results come from keyword matching">Keyword-based</Badge>;
  return null;
}

export default function AnalysisNotice({ status, mode, warnings = [], error, onRetry, retrying }) {
  if (status === 'failed') {
    return (
      <Alert
        variant="warning"
        title="Analysis did not complete"
        action={
          onRetry ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry} disabled={retrying}>
              {retrying ? 'Analysing…' : 'Try analysis again'}
            </button>
          ) : null
        }
      >
        {error || 'The AI service could not analyse this document.'}
      </Alert>
    );
  }
  if (mode === 'heuristic') {
    return (
      <Alert
        variant="warning"
        title="Showing keyword-based results"
        action={
          onRetry ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry} disabled={retrying}>
              {retrying ? 'Analysing…' : 'Retry with AI'}
            </button>
          ) : null
        }
      >
        {warnings[0] || 'The AI provider was unavailable, so only skills matched by keyword are shown.'}
      </Alert>
    );
  }
  return null;
}
