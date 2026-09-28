import { useState } from 'react';
import { Link } from 'react-router-dom';
import { interviewsApi } from '../../api';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Icon from '../../components/ui/Icon';
import PageHeader from '../../components/ui/PageHeader';
import { SkeletonCards } from '../../components/ui/Skeleton';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { getErrorMessage } from '../../utils/errors';
import { CATEGORY_LABELS, DIFFICULTY_LABELS, formatDate, formatScore, scoreTone } from '../../utils/format';

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'completed', label: 'Completed' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'abandoned', label: 'Abandoned' },
];
const STATUS = { completed: ['good', 'Completed'], in_progress: ['info', 'In progress'], abandoned: ['neutral', 'Abandoned'] };

export default function Interviews() {
  useDocumentTitle('Interview history');
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useAsync(
    () => interviewsApi.list({ page, limit: 10, ...(status ? { status } : {}) }),
    [status, page],
  );
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const remove = async () => {
    setDeleting(true);
    try {
      await interviewsApi.remove(toDelete._id);
      toast.success('Interview deleted');
      setToDelete(null);
      reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="stack-lg">
      <PageHeader title="Interview history" description="Every mock interview you have started, with its score and report." actions={<Button to="/interview/new">New interview</Button>} />

      <div className="segmented" role="radiogroup" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <label key={f.value}>
            <input
              type="radio"
              name="status"
              checked={status === f.value}
              onChange={() => {
                setStatus(f.value);
                setPage(1);
              }}
            />
            {f.label}
          </label>
        ))}
      </div>

      {loading && !data ? (
        <SkeletonCards count={4} height={64} />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : data.items.length === 0 ? (
        <EmptyState icon="history" title={status ? 'No interviews with this status' : 'No interviews yet'} action={<Button to="/interview/new">Start an interview</Button>}>
          Completed interviews appear here with their score and report.
        </EmptyState>
      ) : (
        <>
          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Role</th>
                    <th>Topic</th>
                    <th>Started</th>
                    <th>Status</th>
                    <th>Score</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((iv) => (
                    <tr key={iv._id}>
                      <td>
                        <Link to={iv.status === 'completed' ? `/interview/${iv._id}/result` : `/interview/${iv._id}`}>{iv.role}</Link>
                        {iv.job?.title ? <div className="xs muted">{iv.job.title}</div> : null}
                      </td>
                      <td className="nowrap">
                        {CATEGORY_LABELS[iv.category]}
                        <div className="xs muted">{DIFFICULTY_LABELS[iv.difficulty]}</div>
                      </td>
                      <td className="nowrap">{formatDate(iv.createdAt)}</td>
                      <td>
                        <Badge tone={STATUS[iv.status][0]}>{STATUS[iv.status][1]}</Badge>
                      </td>
                      <td>{iv.averageScore !== null && iv.averageScore !== undefined ? <Badge tone={scoreTone(iv.averageScore)}>{formatScore(iv.averageScore)}</Badge> : <span className="faint">—</span>}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button type="button" className="btn btn-ghost btn-sm icon-btn" aria-label={`Delete interview ${iv.role}`} onClick={() => setToDelete(iv)}>
                          <Icon name="trash" size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {data.pages > 1 ? (
            <div className="row" style={{ justifyContent: 'center' }}>
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="small muted">
                Page {data.page} of {data.pages}
              </span>
              <Button variant="secondary" size="sm" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          ) : null}
        </>
      )}

      <ConfirmDialog open={Boolean(toDelete)} title="Delete this interview?" confirmLabel="Delete interview" danger loading={deleting} onConfirm={remove} onCancel={() => setToDelete(null)}>
        The transcript and report will be permanently deleted.
      </ConfirmDialog>
    </div>
  );
}
