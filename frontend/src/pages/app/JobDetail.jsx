import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { jobsApi, resumesApi } from '../../api';
import AnalysisNotice, { AnalysisModeBadge } from '../../components/AnalysisNotice';
import Alert from '../../components/ui/Alert';
import Button from '../../components/ui/Button';
import ErrorState from '../../components/ui/ErrorState';
import PageHeader from '../../components/ui/PageHeader';
import { ProgressBar } from '../../components/ui/Scores';
import { SkeletonCards } from '../../components/ui/Skeleton';
import TagList from '../../components/ui/TagList';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { getErrorMessage } from '../../utils/errors';
import { formatDate, LEVEL_LABELS } from '../../utils/format';

function MatchAnalysis({ match, jobId }) {
  const cov = match.coverage || {};
  return (
    <div className="stack">
      <div className="row-between">
        <div>
          <h3>Interview Preparation Match Analysis</h3>
          <p className="xs muted">
            Resume: {match.resume?.filename || 'deleted resume'}, updated {formatDate(match.updatedAt, true)}
          </p>
        </div>
        <AnalysisModeBadge mode={match.analysisMode} />
      </div>
      {match.warnings?.length ? <Alert variant="warning">{match.warnings[0]}</Alert> : null}

      {cov.percent !== null && cov.percent !== undefined ? (
        <div className="stack-sm">
          <div className="row-between small">
            <span>
              Required skills found on your resume: <strong>{cov.requiredMatched}</strong> of {cov.requiredTotal}
            </span>
            <span className="muted">about {cov.percent}%</span>
          </div>
          <ProgressBar value={cov.requiredMatched} max={cov.requiredTotal || 1} label="Required skill coverage" />
          <span className="xs faint">{cov.label}</span>
        </div>
      ) : null}

      <div className="grid-2">
        <div>
          <h4 className="small" style={{ marginBottom: 8 }}>Skills you already show</h4>
          <TagList items={match.matchingSkills} tone="good" empty="No overlapping skills found" />
        </div>
        <div>
          <h4 className="small" style={{ marginBottom: 8 }}>Required skills to prepare</h4>
          <TagList items={match.missingSkills} tone="bad" empty="Every required skill appears on your resume" />
          {match.missingPreferredSkills?.length ? (
            <>
              <h4 className="small" style={{ margin: '12px 0 8px' }}>Nice-to-have skills missing</h4>
              <TagList items={match.missingPreferredSkills} tone="mid" />
            </>
          ) : null}
        </div>
      </div>

      {match.relevantProjects?.length ? (
        <div>
          <h4 className="small" style={{ marginBottom: 8 }}>Projects to talk about</h4>
          <ul className="bullets small">
            {match.relevantProjects.map((p) => (
              <li key={p.name}>
                <strong>{p.name}</strong>
                {p.reason ? <span className="muted"> — {p.reason}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {match.experienceAlignment ? (
        <div>
          <h4 className="small" style={{ marginBottom: 8 }}>Experience alignment</h4>
          <p className="small">{match.experienceAlignment}</p>
        </div>
      ) : null}

      <div className="grid-2">
        <div>
          <h4 className="small" style={{ marginBottom: 8 }}>Likely interview topics</h4>
          <TagList items={match.interviewTopics} empty="None suggested" />
        </div>
        <div>
          <h4 className="small" style={{ marginBottom: 8 }}>How to prepare</h4>
          {match.recommendations?.length ? (
            <ul className="bullets small">
              {match.recommendations.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          ) : (
            <p className="small faint">No recommendations.</p>
          )}
        </div>
      </div>

      <p className="xs faint">{match.disclaimer}</p>
      <div>
        <Button to={`/interview/new?jobId=${jobId}${match.resume?._id ? `&resumeId=${match.resume._id}` : ''}`}>Practise for this role</Button>
      </div>
    </div>
  );
}

export default function JobDetail() {
  const { id } = useParams();
  const toast = useToast();
  const { data, error, loading, reload, setData } = useAsync(() => jobsApi.get(id), [id]);
  const resumes = useAsync(() => resumesApi.list().then((r) => r.resumes), []);
  const [resumeId, setResumeId] = useState('');
  const [matching, setMatching] = useState(false);
  const [matchError, setMatchError] = useState('');
  const [retrying, setRetrying] = useState(false);
  useDocumentTitle(data?.job?.title || 'Job description');

  const selectedResumeId = resumeId || resumes.data?.[0]?._id || '';

  const runMatch = async () => {
    setMatchError('');
    setMatching(true);
    try {
      const { match } = await jobsApi.match(id, selectedResumeId);
      setData((d) => ({ ...d, matches: [match, ...d.matches.filter((m) => m._id !== match._id)] }));
      toast.success('Match analysis ready');
    } catch (err) {
      setMatchError(getErrorMessage(err));
    } finally {
      setMatching(false);
    }
  };

  const reanalyze = async () => {
    setRetrying(true);
    try {
      const { job } = await jobsApi.reanalyze(id);
      setData((d) => ({ ...d, job }));
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setRetrying(false);
    }
  };

  const back = { to: '/jobs', label: 'Job descriptions' };
  if (loading && !data) return <><PageHeader title="Job description" back={back} /><SkeletonCards count={3} /></>;
  if (error) return <><PageHeader title="Job description" back={back} /><ErrorState error={error} onRetry={reload} /></>;

  const { job, matches } = data;
  const selectedMatch = matches.find((m) => m.resume?._id === selectedResumeId) || matches[0];

  return (
    <div className="stack-lg">
      <PageHeader
        back={back}
        title={job.title || 'Untitled role'}
        description={[job.company, LEVEL_LABELS[job.experienceLevel]].filter(Boolean).join(', ')}
        actions={
          <>
            <AnalysisModeBadge mode={job.analysisMode} />
            <Button variant="secondary" onClick={reanalyze} loading={retrying}>
              Re-analyse
            </Button>
          </>
        }
      />
      <AnalysisNotice status={job.analysisStatus} mode={job.analysisMode} warnings={job.analysisWarnings} error={job.analysisError} onRetry={reanalyze} retrying={retrying} />

      <div className="split">
        <div className="stack">
          {job.summary ? (
            <section className="card">
              <h2 className="section-title">Role summary</h2>
              <p>{job.summary}</p>
            </section>
          ) : null}
          <section className="card stack">
            <div>
              <h2 className="section-title">Required skills</h2>
              <TagList items={job.requiredSkills} empty="None extracted" />
            </div>
            <div>
              <h2 className="section-title">Preferred skills</h2>
              <TagList items={job.preferredSkills} empty="None extracted" />
            </div>
            <div>
              <h2 className="section-title">Technologies</h2>
              <TagList items={job.technologies} empty="None extracted" />
            </div>
          </section>
          {job.responsibilities?.length ? (
            <section className="card">
              <h2 className="section-title">Responsibilities</h2>
              <ul className="bullets small">
                {job.responsibilities.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </section>
          ) : null}
          <details className="card details">
            <summary>Show original posting</summary>
            <pre className="io-block" style={{ maxHeight: 400, fontFamily: 'var(--font)' }}>{job.rawText}</pre>
          </details>
        </div>

        <section className="card stack" aria-labelledby="match-heading">
          <h2 id="match-heading" className="section-title">Compare with your resume</h2>
          {resumes.loading && !resumes.data ? (
            <SkeletonCards count={1} height={40} />
          ) : !resumes.data?.length ? (
            <Alert variant="info" action={<Button size="sm" to="/resumes">Upload a resume</Button>}>
              Upload a resume to see which required skills you already cover.
            </Alert>
          ) : (
            <div className="stack-sm">
              <label className="label" htmlFor="resume-select">
                Resume
              </label>
              <select id="resume-select" className="select" value={selectedResumeId} onChange={(e) => setResumeId(e.target.value)}>
                {resumes.data.map((r) => (
                  <option key={r._id} value={r._id}>
                    {r.filename}
                  </option>
                ))}
              </select>
              <Button onClick={runMatch} loading={matching} disabled={!selectedResumeId || job.analysisStatus !== 'completed'}>
                {matching ? 'Comparing…' : 'Run match analysis'}
              </Button>
              {job.analysisStatus !== 'completed' ? <span className="xs muted">Analyse the job description first.</span> : null}
            </div>
          )}
          {matchError ? <Alert variant="error">{matchError}</Alert> : null}
          {selectedMatch ? (
            <>
              <hr className="divider" />
              <MatchAnalysis match={selectedMatch} jobId={job._id} />
            </>
          ) : null}
          {matches.length > 1 ? (
            <p className="xs muted">
              {matches.length} analyses saved for this job. Select a resume above to view its analysis.
            </p>
          ) : null}
          {!selectedMatch && resumes.data?.length ? (
            <p className="small muted">
              No analysis yet. Run one to see prep topics, or <Link to={`/interview/new?jobId=${job._id}`}>start an interview for this role</Link>.
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
