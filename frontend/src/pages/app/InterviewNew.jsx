import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { interviewsApi, jobsApi, resumesApi } from '../../api';
import Alert from '../../components/ui/Alert';
import Button from '../../components/ui/Button';
import Field from '../../components/ui/Field';
import PageHeader from '../../components/ui/PageHeader';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { getErrorMessage, isAiUnavailable } from '../../utils/errors';
import { CATEGORY_LABELS, DIFFICULTY_LABELS } from '../../utils/format';

const CATEGORY_HINTS = {
  mixed: 'Topics chosen from the job and your gaps',
  resume: 'Deep-dive into your own projects',
  behavioral: 'STAR-style situational questions',
  dsa: 'Complexity, patterns, problem solving',
  'system-design': 'Scalability and trade-offs',
};
const LENGTHS = [3, 5, 7, 10];

export default function InterviewNew() {
  useDocumentTitle('New interview');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const resumes = useAsync(() => resumesApi.list().then((r) => r.resumes), []);
  const jobs = useAsync(() => jobsApi.list().then((r) => r.jobs), []);

  const [form, setForm] = useState({
    role: '',
    category: params.get('jobId') ? 'mixed' : 'dsa',
    difficulty: 'medium',
    totalQuestions: 5,
    resumeId: params.get('resumeId') || '',
    jobId: params.get('jobId') || '',
  });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Default the role to the selected job's title.
  const selectedJob = jobs.data?.find((j) => j._id === form.jobId);
  const defaultRole = selectedJob?.title || 'Software Engineer';

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { interview } = await interviewsApi.start({
        role: form.role.trim() || defaultRole,
        category: form.category,
        difficulty: form.difficulty,
        totalQuestions: Number(form.totalQuestions),
        resumeId: form.resumeId || null,
        jobId: form.jobId || null,
      });
      navigate(`/interview/${interview._id}`);
    } catch (err) {
      setError(err);
      setLoading(false);
    }
  };

  const needsResume = form.category === 'resume' && !form.resumeId;

  return (
    <div className="container-narrow stack-lg">
      <PageHeader
        title="New mock interview"
        description="Questions are generated one at a time. Each one reacts to your previous answers, so no two interviews are the same."
      />
      <form className="card stack-lg" onSubmit={onSubmit}>
        {error ? (
          <Alert variant="error" title={isAiUnavailable(error) ? 'The AI model is not available' : 'Could not start the interview'}>
            {getErrorMessage(error)}
          </Alert>
        ) : null}

        <Field label="Role you are preparing for" placeholder={selectedJob?.title || 'e.g. Backend Developer, SDE 1'} value={form.role} maxLength={120} onChange={set('role')} hint={`Used to pitch questions at the right level. Leave empty to use "${defaultRole}".`} />

        <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label" style={{ marginBottom: 8 }}>Topic</legend>
          <div className="choice-grid">
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <label key={value} className="choice">
                <input type="radio" name="category" value={value} checked={form.category === value} onChange={set('category')} />
                <strong>{label}</strong>
                {CATEGORY_HINTS[value] ? <span>{CATEGORY_HINTS[value]}</span> : null}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid-2">
          <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="label" style={{ marginBottom: 8 }}>Difficulty</legend>
            <div className="segmented">
              {Object.entries(DIFFICULTY_LABELS).map(([value, label]) => (
                <label key={value}>
                  <input type="radio" name="difficulty" value={value} checked={form.difficulty === value} onChange={set('difficulty')} />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="label" style={{ marginBottom: 8 }}>Main questions</legend>
            <div className="segmented">
              {LENGTHS.map((n) => (
                <label key={n}>
                  <input type="radio" name="totalQuestions" value={n} checked={Number(form.totalQuestions) === n} onChange={set('totalQuestions')} />
                  {n}
                </label>
              ))}
            </div>
            <span className="hint">Follow-up questions may be added when an answer needs probing.</span>
          </fieldset>
        </div>

        <div className="grid-2">
          <Field as="select" label="Resume (recommended)" value={form.resumeId} onChange={set('resumeId')} error={needsResume ? 'Resume questions need a resume.' : undefined}>
            <option value="">No resume</option>
            {resumes.data?.map((r) => (
              <option key={r._id} value={r._id}>
                {r.filename}
              </option>
            ))}
          </Field>
          <Field as="select" label="Job description (optional)" value={form.jobId} onChange={set('jobId')}>
            <option value="">No job description</option>
            {jobs.data?.map((j) => (
              <option key={j._id} value={j._id}>
                {j.title || 'Untitled role'}
                {j.company ? ` (${j.company})` : ''}
              </option>
            ))}
          </Field>
        </div>

        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button type="submit" size="lg" loading={loading} disabled={needsResume}>
            {loading ? 'Preparing your first question…' : 'Start interview'}
          </Button>
        </div>
      </form>
    </div>
  );
}
