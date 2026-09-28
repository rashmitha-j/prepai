import { useState } from 'react';
import { Link } from 'react-router-dom';
import { jobsApi } from '../../api';
import { AnalysisModeBadge } from '../../components/AnalysisNotice';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Icon from '../../components/ui/Icon';
import PageHeader from '../../components/ui/PageHeader';
import { SkeletonCards } from '../../components/ui/Skeleton';
import TagList from '../../components/ui/TagList';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { getErrorMessage } from '../../utils/errors';
import { formatDate, LEVEL_LABELS } from '../../utils/format';

export default function Jobs() {
  useDocumentTitle('Job descriptions');
  const toast = useToast();
  const { data, error, loading, reload, setData } = useAsync(() => jobsApi.list().then((r) => r.jobs), []);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await jobsApi.remove(toDelete._id);
      setData((list) => list.filter((j) => j._id !== toDelete._id));
      toast.success('Job description deleted');
      setToDelete(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="stack-lg">
      <PageHeader
        title="Job descriptions"
        description="Paste a job posting to extract required skills and compare it with your resume."
        actions={
          <Button to="/jobs/new">
            <Icon name="plus" size={16} /> Add job description
          </Button>
        }
      />
      {loading && !data ? (
        <SkeletonCards count={3} height={90} />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : data.length === 0 ? (
        <EmptyState icon="job" title="No job descriptions yet" action={<Button to="/jobs/new">Add a job description</Button>}>
          Add the posting you are preparing for. Interviews and match analysis use it to focus on what the role needs.
        </EmptyState>
      ) : (
        <div className="stack">
          {data.map((job) => (
            <article key={job._id} className="card card-tight">
              <div className="row-between">
                <div className="grow" style={{ minWidth: 0 }}>
                  <Link to={`/jobs/${job._id}`} style={{ color: 'var(--ink)', fontWeight: 600 }} className="break">
                    {job.title || 'Untitled role'}
                  </Link>
                  <div className="xs muted">
                    {[job.company, LEVEL_LABELS[job.experienceLevel], `added ${formatDate(job.createdAt)}`].filter(Boolean).join(', ')}
                  </div>
                </div>
                <div className="row">
                  {job.analysisStatus === 'failed' ? <Badge tone="bad">Analysis failed</Badge> : <AnalysisModeBadge mode={job.analysisMode} />}
                  <button type="button" className="btn btn-danger-ghost btn-sm" onClick={() => setToDelete(job)}>
                    <Icon name="trash" size={14} /> Delete
                  </button>
                </div>
              </div>
              {job.requiredSkills?.length ? (
                <div style={{ marginTop: 12 }}>
                  <TagList items={job.requiredSkills} max={10} />
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete this job description?"
        confirmLabel="Delete"
        danger
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      >
        {toDelete?.title} and its match analyses will be permanently deleted.
      </ConfirmDialog>
    </div>
  );
}
