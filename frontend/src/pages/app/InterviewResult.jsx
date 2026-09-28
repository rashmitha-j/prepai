import { useParams } from 'react-router-dom';
import { interviewsApi } from '../../api';
import { AnalysisModeBadge } from '../../components/AnalysisNotice';
import FeedbackCard from '../../components/FeedbackCard';
import SourceList from '../../components/SourceList';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import ErrorState from '../../components/ui/ErrorState';
import PageHeader from '../../components/ui/PageHeader';
import { ScoreBar, ScoreRing } from '../../components/ui/Scores';
import { SkeletonCards } from '../../components/ui/Skeleton';
import TagList from '../../components/ui/TagList';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { getErrorCode } from '../../utils/errors';
import { CATEGORY_LABELS, DIFFICULTY_LABELS, formatDate, formatScore, SCORE_LABELS, scoreTone } from '../../utils/format';

function List({ items, empty }) {
  if (!items?.length) return <p className="small faint">{empty}</p>;
  return (
    <ul className="bullets small">
      {items.map((i) => (
        <li key={i}>{i}</li>
      ))}
    </ul>
  );
}

export default function InterviewResult() {
  const { id } = useParams();
  const { data, error, loading, reload } = useAsync(() => interviewsApi.report(id), [id]);
  useDocumentTitle('Interview report');
  const back = { to: '/interviews', label: 'Interview history' };

  if (loading && !data) return <><PageHeader title="Interview report" back={back} /><SkeletonCards count={3} height={140} /></>;
  if (error) {
    if (getErrorCode(error) === 'NOT_FOUND') {
      return (
        <>
          <PageHeader title="Interview report" back={back} />
          <Alert variant="info" action={<Button size="sm" to={`/interview/${id}`}>Go to the interview</Button>}>
            This interview has no report yet. Finish the interview to generate one.
          </Alert>
        </>
      );
    }
    return <><PageHeader title="Interview report" back={back} /><ErrorState error={error} onRetry={reload} /></>;
  }

  const { interview, report } = data;
  const answered = interview.turns.filter((t) => t.evaluation);
  const numbered = [];
  for (const t of answered) {
    const mainIndex = answered.filter((x) => !x.isFollowUp && x.index <= t.index).length;
    numbered.push({ turn: t, label: t.isFollowUp ? 'Follow-up' : `Question ${mainIndex}` });
  }

  return (
    <div className="stack-lg">
      <PageHeader
        back={back}
        title={`Report: ${interview.role}`}
        description={`${CATEGORY_LABELS[interview.category]}, ${DIFFICULTY_LABELS[interview.difficulty].toLowerCase()}, completed ${formatDate(interview.completedAt, true)}`}
        actions={
          <>
            <AnalysisModeBadge mode={report.analysisMode} />
            <Button to="/interview/new">Practise again</Button>
          </>
        }
      />

      {report.warnings?.length ? <Alert variant="warning">{report.warnings[0]}</Alert> : null}

      <section className="card">
        <div className="row" style={{ alignItems: 'flex-start', gap: 24 }}>
          <ScoreRing value={report.averageScore} size={96} label="Average score" />
          <div className="grow stack-sm" style={{ minWidth: 240 }}>
            <h2 className="section-title" style={{ marginBottom: 0 }}>Overall performance</h2>
            <p>{report.summary}</p>
            <span className="xs faint">
              {answered.length} answered question{answered.length === 1 ? '' : 's'}. Scores are AI assessments for practice — they can be wrong.
            </span>
          </div>
        </div>
      </section>

      <div className="grid-2">
        <section className="card">
          <h2 className="section-title">Rubric averages</h2>
          <div className="stack-sm">
            {Object.entries(SCORE_LABELS).map(([k, label]) =>
              report.dimensionAverages?.[k] !== undefined ? <ScoreBar key={k} label={label} value={report.dimensionAverages[k]} /> : null,
            )}
          </div>
        </section>
        <section className="card">
          <h2 className="section-title">Scores by topic</h2>
          {report.topicScores?.length ? (
            <div className="stack-sm">
              {report.topicScores.map((t) => (
                <ScoreBar key={t.topic} label={t.topic} value={t.averageScore} />
              ))}
            </div>
          ) : (
            <p className="small faint">No topic scores.</p>
          )}
        </section>
      </div>

      <div className="grid-3">
        <section className="card">
          <h2 className="section-title" style={{ color: 'var(--good)' }}>Strengths</h2>
          <List items={report.strengths} empty="No specific strengths recorded." />
        </section>
        <section className="card">
          <h2 className="section-title" style={{ color: 'var(--bad)' }}>Weak areas</h2>
          <List items={report.weakAreas} empty="No weak areas recorded." />
        </section>
        <section className="card">
          <h2 className="section-title">Technical gaps</h2>
          <List items={report.technicalGaps} empty="No specific gaps recorded." />
        </section>
      </div>

      {report.communicationFeedback ? (
        <section className="card">
          <h2 className="section-title">Communication</h2>
          <p>{report.communicationFeedback}</p>
        </section>
      ) : null}

      <div className="split">
        <section className="card" aria-labelledby="roadmap-heading">
          <h2 id="roadmap-heading" className="section-title">Your learning roadmap</h2>
          {report.roadmap?.length ? (
            <ol className="roadmap">
              {report.roadmap.map((step) => (
                <li key={step.title}>
                  <div className="row-between">
                    <strong>{step.title}</strong>
                    {step.duration ? <Badge>{step.duration}</Badge> : null}
                  </div>
                  {step.focus ? <p className="small muted" style={{ marginTop: 4 }}>{step.focus}</p> : null}
                  {step.actions?.length ? (
                    <ul className="bullets small" style={{ marginTop: 8 }}>
                      {step.actions.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="small faint">No roadmap generated.</p>
          )}
        </section>
        <section className="card stack">
          <div>
            <h2 className="section-title">Recommended topics</h2>
            <TagList items={report.recommendedTopics} empty="None" />
          </div>
          <SourceList sources={report.sources} label="Study notes used" />
          <Button variant="secondary" to="/knowledge">
            Browse the knowledge base
          </Button>
        </section>
      </div>

      <section className="stack" aria-labelledby="qa-heading">
        <h2 id="qa-heading" className="section-title">Question-by-question feedback</h2>
        {numbered.map(({ turn, label }) => (
          <article key={turn.index} className={`card${turn.isFollowUp ? ' transcript-turn follow-up' : ''}`}>
            <details className="details">
              <summary>
                <span className="row" style={{ gap: 8 }}>
                  <span className="grow" style={{ color: 'var(--ink)' }}>
                    <span className="muted">{label}:</span> {turn.question}
                  </span>
                  <Badge tone={scoreTone(turn.evaluation.overallScore)}>{formatScore(turn.evaluation.overallScore)}</Badge>
                </span>
              </summary>
              <div className="stack">
                <div className="answer-quote">{turn.answer}</div>
                <FeedbackCard turn={turn} />
              </div>
            </details>
          </article>
        ))}
      </section>
    </div>
  );
}
