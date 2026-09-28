import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { resumesApi } from '../../api';
import { AnalysisModeBadge } from '../../components/AnalysisNotice';
import FileDropzone from '../../components/FileDropzone';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Icon from '../../components/ui/Icon';
import PageHeader from '../../components/ui/PageHeader';
import { ProgressBar } from '../../components/ui/Scores';
import { SkeletonCards } from '../../components/ui/Skeleton';
import Spinner from '../../components/ui/Spinner';
import TagList from '../../components/ui/TagList';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { getErrorMessage } from '../../utils/errors';
import { formatBytes, formatDate } from '../../utils/format';

export default function Resumes() {
  useDocumentTitle('Resumes');
  const toast = useToast();
  const navigate = useNavigate();
  const { data, error, loading, reload, setData } = useAsync(() => resumesApi.list().then((r) => r.resumes), []);
  const [upload, setUpload] = useState(null); // { name, progress, phase }
  const [uploadError, setUploadError] = useState('');
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const onFile = async (file) => {
    setUploadError('');
    setUpload({ name: file.name, progress: 0, phase: 'uploading' });
    try {
      const { resume } = await resumesApi.upload(file, (e) => {
        const progress = e.total ? Math.round((e.loaded / e.total) * 100) : 0;
        setUpload({ name: file.name, progress, phase: progress >= 100 ? 'analysing' : 'uploading' });
      });
      setUpload(null);
      if (resume.analysisStatus === 'failed') toast.info('Resume saved. AI analysis did not complete — you can retry from the resume page.');
      else toast.success('Resume uploaded and analysed');
      navigate(`/resumes/${resume._id}`);
    } catch (err) {
      setUpload(null);
      setUploadError(getErrorMessage(err));
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await resumesApi.remove(toDelete._id);
      setData((list) => list.filter((r) => r._id !== toDelete._id));
      toast.success('Resume deleted');
      setToDelete(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="stack-lg">
      <PageHeader title="Resumes" description="Upload a PDF resume. PrepAI extracts the text and analyses your skills, projects and experience." />

      <section className="card stack" aria-label="Upload a resume">
        {upload ? (
          <div className="stack-sm" aria-live="polite">
            <div className="row">
              <Spinner />
              <strong className="small break">{upload.name}</strong>
            </div>
            <ProgressBar value={upload.phase === 'analysing' ? 100 : upload.progress} max={100} label="Upload progress" />
            <span className="small muted">
              {upload.phase === 'analysing'
                ? 'Extracting text and analysing with AI. Local models can take up to a minute…'
                : `Uploading… ${upload.progress}%`}
            </span>
          </div>
        ) : (
          <FileDropzone onFile={onFile} />
        )}
        {uploadError ? <Alert variant="error" title="Upload failed">{uploadError}</Alert> : null}
      </section>

      <section aria-labelledby="your-resumes">
        <h2 id="your-resumes" className="section-title">Your resumes</h2>
        {loading && !data ? (
          <SkeletonCards count={2} height={88} />
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : data.length === 0 ? (
          <EmptyState icon="resume" title="No resumes yet">
            Upload your resume above to get personalised interview questions.
          </EmptyState>
        ) : (
          <div className="stack">
            {data.map((r) => (
              <article key={r._id} className="card card-tight">
                <div className="row-between">
                  <div className="row grow" style={{ minWidth: 0 }}>
                    <Icon name="file" className="faint" />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <Link to={`/resumes/${r._id}`} style={{ color: 'var(--ink)', fontWeight: 500 }} className="break">
                        {r.filename}
                      </Link>
                      <div className="xs muted">
                        Uploaded {formatDate(r.createdAt)}, {formatBytes(r.fileSize)}, {r.pageCount} page{r.pageCount === 1 ? '' : 's'}
                      </div>
                    </div>
                  </div>
                  <div className="row">
                    {r.analysisStatus === 'failed' ? <Badge tone="bad">Analysis failed</Badge> : <AnalysisModeBadge mode={r.analysisMode} />}
                    <button type="button" className="btn btn-danger-ghost btn-sm" onClick={() => setToDelete(r)}>
                      <Icon name="trash" size={14} /> Delete
                    </button>
                  </div>
                </div>
                {r.skills?.length ? (
                  <div style={{ marginTop: 12 }}>
                    <TagList items={r.skills} max={10} />
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete this resume?"
        confirmLabel="Delete resume"
        danger
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      >
        {toDelete?.filename} and its match analyses will be permanently deleted. Past interviews keep their saved context.
      </ConfirmDialog>
    </div>
  );
}
