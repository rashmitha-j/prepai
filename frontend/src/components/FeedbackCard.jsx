import { RubricBars, ScoreRing } from './ui/Scores';
import SourceList from './SourceList';

/** AI evaluation of one answer: rubric, what was good, what was missing, model answer. */
export default function FeedbackCard({ turn, compact = false }) {
  const ev = turn.evaluation;
  if (!ev) return null;
  return (
    <div className="stack">
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <ScoreRing value={ev.overallScore} size={compact ? 52 : 72} />
        <div className="grow stack-sm">
          <p>{ev.summary}</p>
          <span className="xs faint">Overall score is a weighted rubric average computed by PrepAI, not by the model.</span>
        </div>
      </div>
      <RubricBars scores={ev.scores} />
      <div className="feedback-grid">
        <div>
          <h4 className="small" style={{ marginBottom: 6, color: 'var(--good)' }}>What went well</h4>
          {ev.strengths?.length ? (
            <ul className="bullets small">
              {ev.strengths.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          ) : (
            <p className="small faint">Nothing specific noted.</p>
          )}
        </div>
        <div>
          <h4 className="small" style={{ marginBottom: 6, color: 'var(--bad)' }}>Missing or incorrect</h4>
          {ev.missingPoints?.length ? (
            <ul className="bullets small">
              {ev.missingPoints.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          ) : (
            <p className="small faint">No major gaps.</p>
          )}
        </div>
      </div>
      {ev.suggestions?.length ? (
        <div>
          <h4 className="small" style={{ marginBottom: 6 }}>How to improve</h4>
          <ul className="bullets small">
            {ev.suggestions.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {ev.modelAnswer ? (
        <details className="details">
          <summary>Show a model answer</summary>
          <p className="small" style={{ whiteSpace: 'pre-line' }}>{ev.modelAnswer}</p>
          {turn.expectedPoints?.length ? (
            <>
              <h4 className="small" style={{ margin: '12px 0 6px' }}>Key points interviewers look for</h4>
              <ul className="bullets small">
                {turn.expectedPoints.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </>
          ) : null}
        </details>
      ) : null}
      <SourceList sources={ev.sources} label="Checked against" />
    </div>
  );
}
