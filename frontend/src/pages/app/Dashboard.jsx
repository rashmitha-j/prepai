import { Link } from 'react-router-dom';
import { dashboardApi } from '../../api';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import PageHeader from '../../components/ui/PageHeader';
import { ProgressBar, ScoreBar } from '../../components/ui/Scores';
import Skeleton from '../../components/ui/Skeleton';
import StatCard from '../../components/ui/StatCard';
import { useAuth } from '../../context/AuthContext';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { CATEGORY_LABELS, DIFFICULTY_LABELS, formatDate, formatScore, scoreTone } from '../../utils/format';

const STATUS_TONE = { completed: 'good', in_progress: 'info', abandoned: 'neutral' };
const STATUS_LABEL = { completed: 'Completed', in_progress: 'In progress', abandoned: 'Abandoned' };

function ScoreTrend({ points }) {
  if (points.length < 2) return <p className="small muted">Complete a few interviews to see your score trend.</p>;
  const w = 320;
  const h = 90;
  const step = w / (points.length - 1);
  const y = (s) => h - (Math.max(0, Math.min(10, s ?? 0)) / 10) * (h - 10) - 5;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)},${y(p.score).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label={`Score trend over the last ${points.length} interviews`}>
      <line x1="0" x2={w} y1={y(7.5)} y2={y(7.5)} stroke="var(--border)" strokeDasharray="4 4" />
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle key={i} cx={i * step} cy={y(p.score)} r="3.5" fill="var(--surface)" stroke="var(--accent)" strokeWidth="2">
          <title>{`${formatDate(p.date)}: ${formatScore(p.score)}`}</title>
        </circle>
      ))}
    </svg>
  );
}

function DashboardSkeleton() {
  return (
    <div className="stack-lg" aria-busy="true">
      <div className="grid-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={92} radius="var(--r-md)" />
        ))}
      </div>
      <div className="split">
        <Skeleton height={280} radius="var(--r-md)" />
        <Skeleton height={280} radius="var(--r-md)" />
      </div>
    </div>
  );
}

export default function Dashboard() {
  useDocumentTitle('Dashboard');
  const { user } = useAuth();
  const { data, error, loading, reload } = useAsync(() => dashboardApi.get(), []);

  const header = (
    <PageHeader
      title={`Welcome back, ${user?.name?.split(' ')[0] || 'there'}`}
      description="Your practice at a glance."
      actions={<Button to="/interview/new">Start an interview</Button>}
    />
  );

  if (loading && !data) return <>{header}<DashboardSkeleton /></>;
  if (error) return <>{header}<ErrorState error={error} onRetry={reload} /></>;

  const { counts, averageScore, recentInterviews, weakTopics, strongTopics, recommendedTopics, coding, scoreTrend } = data;
  const isNew = counts.resumes === 0 && counts.jobAnalyses === 0 && recentInterviews.length === 0;

  return (
    <div className="stack-lg">
      {header}

      {isNew ? (
        <div className="card">
          <h2 className="section-title">Get set up in three steps</h2>
          <ol className="roadmap">
            <li>
              <strong>Upload your resume</strong>
              <p className="small muted">PrepAI extracts your skills and projects to personalise questions.</p>
              <Button variant="secondary" size="sm" to="/resumes" style={{ marginTop: 8 }}>
                Upload resume
              </Button>
            </li>
            <li>
              <strong>Add a job description</strong>
              <p className="small muted">See which required skills you already cover and which to prepare.</p>
              <Button variant="secondary" size="sm" to="/jobs/new" style={{ marginTop: 8 }}>
                Add job description
              </Button>
            </li>
            <li>
              <strong>Take a mock interview</strong>
              <p className="small muted">Answer one question at a time and get scored feedback after each answer.</p>
              <Button size="sm" to="/interview/new" style={{ marginTop: 8 }}>
                Start an interview
              </Button>
            </li>
          </ol>
        </div>
      ) : null}

      <section className="grid-4" aria-label="Summary">
        <StatCard label="Interviews completed" value={counts.interviewsCompleted} hint={counts.interviewsInProgress ? `${counts.interviewsInProgress} in progress` : undefined} />
        <StatCard label="Average score" value={averageScore === null ? '—' : `${formatScore(averageScore)}/10`} hint="Across completed interviews" />
        <StatCard label="Resumes" value={counts.resumes} />
        <StatCard label="Job analyses" value={counts.jobAnalyses} />
      </section>

      <div className="split">
        <section className="card" aria-labelledby="recent-heading">
          <div className="card-header">
            <h2 id="recent-heading">Recent interviews</h2>
            <Link to="/interviews" className="small">
              View all
            </Link>
          </div>
          {recentInterviews.length === 0 ? (
            <EmptyState icon="interview" title="No interviews yet" action={<Button to="/interview/new" size="sm">Start your first interview</Button>}>
              Pick a topic and difficulty. Each answer gets feedback right away.
            </EmptyState>
          ) : (
            <ul className="list">
              {recentInterviews.map((iv) => (
                <li key={iv._id} className="list-row">
                  <div className="grow">
                    <Link to={iv.status === 'completed' ? `/interview/${iv._id}/result` : `/interview/${iv._id}`} style={{ color: 'var(--ink)', fontWeight: 500 }}>
                      {iv.role}
                    </Link>
                    <div className="xs muted">
                      {CATEGORY_LABELS[iv.category]}, {DIFFICULTY_LABELS[iv.difficulty].toLowerCase()} — {formatDate(iv.createdAt)}
                    </div>
                  </div>
                  <Badge tone={STATUS_TONE[iv.status]}>{STATUS_LABEL[iv.status]}</Badge>
                  {iv.averageScore !== null && iv.averageScore !== undefined ? (
                    <Badge tone={scoreTone(iv.averageScore)}>{formatScore(iv.averageScore)}</Badge>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <hr className="divider" />
          <h3 className="section-title">Score trend</h3>
          <ScoreTrend points={scoreTrend} />
        </section>

        <div className="stack">
          <section className="card" aria-labelledby="weak-heading">
            <h2 id="weak-heading" className="section-title">Topics to work on</h2>
            {weakTopics.length ? (
              <div className="stack-sm">
                {weakTopics.map((t) => (
                  <ScoreBar key={t.topic} label={t.topic} value={t.averageScore} />
                ))}
              </div>
            ) : (
              <p className="small muted">No weak topics yet. Topics scoring below 6.5 across your interviews will appear here.</p>
            )}
            {strongTopics.length ? (
              <>
                <hr className="divider" />
                <h3 className="small muted" style={{ marginBottom: 8 }}>Strongest topics</h3>
                <div className="tags">
                  {strongTopics.map((t) => (
                    <span key={t.topic} className="tag tag-good">
                      {t.topic} {formatScore(t.averageScore)}
                    </span>
                  ))}
                </div>
              </>
            ) : null}
          </section>

          <section className="card" aria-labelledby="rec-heading">
            <h2 id="rec-heading" className="section-title">Recommended next</h2>
            {recommendedTopics.length ? (
              <div className="tags">
                {recommendedTopics.map((t) => (
                  <span key={t} className="tag">{t}</span>
                ))}
              </div>
            ) : (
              <p className="small muted">Finish an interview to get study recommendations.</p>
            )}
          </section>

          <section className="card" aria-labelledby="coding-heading">
            <div className="card-header">
              <h2 id="coding-heading">Coding practice</h2>
              <Link to="/coding" className="small">
                Practise
              </Link>
            </div>
            <p className="small" style={{ marginBottom: 8 }}>
              <strong>{coding.solved}</strong> of {coding.total} problems solved
              <span className="muted">, {coding.submissions} submissions</span>
            </p>
            <ProgressBar value={coding.solved} max={coding.total || 1} label="Problems solved" />
            <div className="row" style={{ marginTop: 12, gap: 8 }}>
              {['easy', 'medium', 'hard'].map((d) => (
                <span key={d} className="badge">
                  {DIFFICULTY_LABELS[d]} {coding.byDifficulty[d].solved}/{coding.byDifficulty[d].total}
                </span>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
