import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { resumesApi } from '../../api';
import AnalysisNotice, { AnalysisModeBadge } from '../../components/AnalysisNotice';
import Button from '../../components/ui/Button';
import ErrorState from '../../components/ui/ErrorState';
import PageHeader from '../../components/ui/PageHeader';
import { SkeletonCards } from '../../components/ui/Skeleton';
import TagList from '../../components/ui/TagList';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { getErrorMessage } from '../../utils/errors';
import { formatDate } from '../../utils/format';

export default function ResumeDetail() {
  const { id } = useParams();
  const toast = useToast();
  const { data: resume, error, loading, reload, setData } = useAsync(() => resumesApi.get(id).then((r) => r.resume), [id]);
  const [retrying, setRetrying] = useState(false);
  useDocumentTitle(resume?.filename || 'Resume');

  const reanalyze = async () => {
    setRetrying(true);
    try {
      const { resume: updated } = await resumesApi.reanalyze(id);
      setData(updated);
      if (updated.analysisStatus === 'completed' && updated.analysisMode === 'ai') toast.success('Resume re-analysed');
      else toast.info('Analysis finished without the AI model — check the notice on this page.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setRetrying(false);
    }
  };

  const back = { to: '/resumes', label: 'Resumes' };
  if (loading && !resume) return <><PageHeader title="Resume" back={back} /><SkeletonCards count={3} /></>;
  if (error) return <><PageHeader title="Resume" back={back} /><ErrorState error={error} onRetry={reload} /></>;

  return (
    <div className="stack-lg">
      <PageHeader
        back={back}
        title={resume.filename}
        description={`Uploaded ${formatDate(resume.createdAt)}${resume.analyzedAt ? `, analysed ${formatDate(resume.analyzedAt, true)}` : ''}`}
        actions={
          <>
            <AnalysisModeBadge mode={resume.analysisMode} />
            <Button variant="secondary" onClick={reanalyze} loading={retrying}>
              Re-analyse
            </Button>
            <Button to={`/interview/new?resumeId=${resume._id}`}>Practise with this resume</Button>
          </>
        }
      />

      <AnalysisNotice
        status={resume.analysisStatus}
        mode={resume.analysisMode}
        warnings={resume.analysisWarnings}
        error={resume.analysisError}
        onRetry={reanalyze}
        retrying={retrying}
      />

      {resume.summary ? (
        <section className="card">
          <h2 className="section-title">Summary</h2>
          <p>{resume.summary}</p>
        </section>
      ) : null}

      <div className="grid-2">
        <section className="card">
          <h2 className="section-title">Skills</h2>
          <TagList items={resume.skills} empty="No skills detected" />
        </section>
        <section className="card">
          <h2 className="section-title">Technologies and tools</h2>
          <TagList items={resume.technologies} empty="No separate technologies listed" />
        </section>
      </div>

      <section className="card">
        <h2 className="section-title">Projects</h2>
        {resume.projects?.length ? (
          <ul className="list">
            {resume.projects.map((p, i) => (
              <li key={`${p.name}-${i}`} className="list-row" style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
                <strong>{p.name}</strong>
                {p.description ? <p className="small muted">{p.description}</p> : null}
                <TagList items={p.technologies} empty="" />
              </li>
            ))}
          </ul>
        ) : (
          <p className="small faint">No projects extracted{resume.analysisMode === 'heuristic' ? ' (requires AI analysis)' : ''}.</p>
        )}
      </section>

      <div className="grid-2">
        <section className="card">
          <h2 className="section-title">Experience</h2>
          {resume.experience?.length ? (
            <ul className="list">
              {resume.experience.map((e, i) => (
                <li key={i} className="list-row" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 4 }}>
                  <strong>{e.title}</strong>
                  <span className="small muted">{[e.organization, e.duration].filter(Boolean).join(', ')}</span>
                  {e.highlights?.length ? (
                    <ul className="bullets small">
                      {e.highlights.map((h) => (
                        <li key={h}>{h}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="small faint">No experience extracted.</p>
          )}
        </section>
        <section className="card">
          <h2 className="section-title">Education</h2>
          {resume.education?.length ? (
            <ul className="list">
              {resume.education.map((e, i) => (
                <li key={i} className="list-row" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 2 }}>
                  <strong>{e.degree}</strong>
                  <span className="small muted">{[e.institution, e.year].filter(Boolean).join(', ')}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="small faint">No education extracted.</p>
          )}
        </section>
      </div>

      <div className="grid-2">
        <section className="card">
          <h2 className="section-title">Strengths</h2>
          {resume.strengths?.length ? (
            <ul className="bullets small">
              {resume.strengths.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          ) : (
            <p className="small faint">No strengths listed.</p>
          )}
        </section>
        <section className="card">
          <h2 className="section-title">Possible gaps</h2>
          {resume.possibleGaps?.length ? (
            <ul className="bullets small">
              {resume.possibleGaps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          ) : (
            <p className="small faint">No gaps listed.</p>
          )}
        </section>
      </div>

      <details className="card details">
        <summary>Show extracted text ({resume.textLength?.toLocaleString()} characters)</summary>
        <pre className="io-block" style={{ maxHeight: 400 }}>{resume.extractedText}</pre>
      </details>
    </div>
  );
}
