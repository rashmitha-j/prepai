import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { jobsApi } from '../../api';
import Alert from '../../components/ui/Alert';
import Button from '../../components/ui/Button';
import Field from '../../components/ui/Field';
import PageHeader from '../../components/ui/PageHeader';
import { useToast } from '../../context/ToastContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { getErrorMessage, getFieldErrors } from '../../utils/errors';

const MAX = 30000;

export default function JobNew() {
  useDocumentTitle('Add job description');
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({ title: '', company: '', rawText: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const text = form.rawText.trim();
    if (text.length < 80) {
      setErrors({ rawText: 'Paste the full job description (at least 80 characters).' });
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const { job } = await jobsApi.create({ title: form.title.trim(), company: form.company.trim(), rawText: text });
      if (job.analysisStatus === 'failed') toast.info('Job saved. AI analysis did not complete — you can retry from the job page.');
      else toast.success('Job description analysed');
      navigate(`/jobs/${job._id}`);
    } catch (err) {
      setErrors(getFieldErrors(err));
      setError(getErrorMessage(err));
      setLoading(false);
    }
  };

  return (
    <div className="container-narrow stack-lg">
      <PageHeader back={{ to: '/jobs', label: 'Job descriptions' }} title="Add a job description" description="Paste the posting as-is. Title and company are optional — PrepAI detects them." />
      <form className="card stack" onSubmit={onSubmit} noValidate>
        {error ? <Alert variant="error">{error}</Alert> : null}
        <div className="grid-2">
          <Field label="Job title (optional)" value={form.title} maxLength={200} onChange={(e) => setForm({ ...form, title: e.target.value })} error={errors.title} />
          <Field label="Company (optional)" value={form.company} maxLength={200} onChange={(e) => setForm({ ...form, company: e.target.value })} error={errors.company} />
        </div>
        <Field
          as="textarea"
          label="Job description"
          rows={14}
          maxLength={MAX}
          value={form.rawText}
          onChange={(e) => setForm({ ...form, rawText: e.target.value })}
          error={errors.rawText}
          hint={`${form.rawText.length.toLocaleString()} / ${MAX.toLocaleString()} characters`}
          placeholder="Paste responsibilities, requirements and nice-to-haves…"
        />
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button variant="secondary" to="/jobs">
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            {loading ? 'Analysing…' : 'Analyse job description'}
          </Button>
        </div>
      </form>
    </div>
  );
}
