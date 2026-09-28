import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { interviewsApi } from '../../api';
import FeedbackCard from '../../components/FeedbackCard';
import SourceList from '../../components/SourceList';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import ErrorState from '../../components/ui/ErrorState';
import PageHeader from '../../components/ui/PageHeader';
import { ProgressBar } from '../../components/ui/Scores';
import Skeleton from '../../components/ui/Skeleton';
import Spinner from '../../components/ui/Spinner';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { getErrorMessage, isAiUnavailable } from '../../utils/errors';
import { CATEGORY_LABELS, DIFFICULTY_LABELS, formatScore, scoreTone } from '../../utils/format';

const MAX_ANSWER = 8000;

function QuestionCard({ turn, number, total }) {
  return (
    <section className="question-card" aria-labelledby="current-question">
      <div className="question-meta">
        {turn.isFollowUp ? <span className="badge badge-accent">Follow-up</span> : <span>Question {number} of {total}</span>}
        {turn.topic ? <span className="badge">{turn.topic}</span> : null}
      </div>
      <p id="current-question" className="question-text">
        {turn.question}
      </p>
      {turn.rationale ? <p className="question-why">{turn.rationale}</p> : null}
    </section>
  );
}

function TranscriptItem({ turn, number }) {
  return (
    <article className={`transcript-turn${turn.isFollowUp ? ' follow-up' : ''}`}>
      <details className="details">
        <summary>
          <span className="row" style={{ gap: 8 }}>
            <span className="grow" style={{ color: 'var(--ink)' }}>
              {turn.isFollowUp ? 'Follow-up' : `Q${number}`}: {turn.question}
            </span>
            {turn.evaluation ? <Badge tone={scoreTone(turn.evaluation.overallScore)}>{formatScore(turn.evaluation.overallScore)}</Badge> : null}
          </span>
        </summary>
        <div className="stack">
          <div className="answer-quote">{turn.answer}</div>
          <FeedbackCard turn={turn} compact />
        </div>
      </details>
    </article>
  );
}

export default function InterviewSession() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: interview, error, loading, reload, setData } = useAsync(() => interviewsApi.get(id).then((r) => r.interview), [id]);
  useDocumentTitle(interview ? `Interview: ${interview.role}` : 'Interview');

  const draftKey = `prepai.draft.${id}`;
  // Restore an unsent draft (e.g. after a reload or a failed evaluation).
  const [answer, setAnswer] = useState(() => {
    try {
      return window.sessionStorage.getItem(draftKey) || '';
    } catch {
      return '';
    }
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [latestFeedbackIndex, setLatestFeedbackIndex] = useState(null);
  const [nextError, setNextError] = useState(null);
  const [retryingNext, setRetryingNext] = useState(false);
  const [confirm, setConfirm] = useState(null); // 'complete' | 'abandon'
  const [finishing, setFinishing] = useState(false);
  const answerRef = useRef(null);

  useEffect(() => {
    try {
      if (answer) window.sessionStorage.setItem(draftKey, answer);
      else window.sessionStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
  }, [answer, draftKey]);

  const openTurn = useMemo(() => {
    const last = interview?.turns?.[interview.turns.length - 1];
    return last && last.answer === null ? last : null;
  }, [interview]);
  const answered = useMemo(() => (interview?.turns || []).filter((t) => t.answer !== null), [interview]);
  const mainNumber = (turn) => interview.turns.filter((t) => !t.isFollowUp && t.index <= turn.index).length;

  const submit = async () => {
    const text = answer.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    setNextError(null);
    try {
      const res = await interviewsApi.answer(id, text);
      setData(res.interview);
      setLatestFeedbackIndex(openTurn.index);
      setAnswer('');
      if (res.nextError) setNextError(res.nextError);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setSubmitError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const retryNext = async () => {
    setRetryingNext(true);
    try {
      const res = await interviewsApi.next(id);
      setData(res.interview);
      setNextError(null);
    } catch (err) {
      setNextError({ message: getErrorMessage(err) });
    } finally {
      setRetryingNext(false);
    }
  };

  const finish = async () => {
    setFinishing(true);
    try {
      if (confirm === 'abandon') {
        await interviewsApi.abandon(id);
        toast.info('Interview abandoned');
        navigate('/dashboard');
      } else {
        await interviewsApi.complete(id);
        try {
          window.sessionStorage.removeItem(draftKey);
        } catch {
          /* ignore */
        }
        navigate(`/interview/${id}/result`);
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
      setFinishing(false);
      setConfirm(null);
    }
  };

  if (loading && !interview) {
    return (
      <div className="stack-lg" aria-busy="true">
        <Skeleton height={40} width="50%" />
        <Skeleton height={200} radius="var(--r-lg)" />
        <Skeleton height={180} radius="var(--r-md)" />
      </div>
    );
  }
  if (error) return <ErrorState error={error} onRetry={reload} title="Could not load this interview" />;
  if (interview.status === 'completed') return <Navigate to={`/interview/${id}/result`} replace />;

  const { progress } = interview;
  const latest = latestFeedbackIndex !== null ? interview.turns[latestFeedbackIndex] : null;
  const abandoned = interview.status === 'abandoned';

  return (
    <div className="stack-lg">
      <PageHeader
        back={{ to: '/interviews', label: 'Interview history' }}
        title={interview.role}
        description={`${CATEGORY_LABELS[interview.category]}, ${DIFFICULTY_LABELS[interview.difficulty].toLowerCase()}`}
        actions={
          abandoned ? (
            <Badge>Abandoned</Badge>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setConfirm('abandon')}>
                Abandon
              </Button>
              <Button variant={progress.finished ? 'primary' : 'secondary'} disabled={!progress.canComplete} onClick={() => setConfirm('complete')}>
                Finish and get report
              </Button>
            </>
          )
        }
      />

      <div className="interview-layout">
        <div className="stack-lg">
          {latest?.evaluation ? (
            <section className="card" aria-live="polite" aria-labelledby="latest-feedback">
              <div className="card-header">
                <h2 id="latest-feedback">Feedback on your last answer</h2>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLatestFeedbackIndex(null)}>
                  Hide
                </button>
              </div>
              <FeedbackCard turn={latest} />
            </section>
          ) : null}

          {nextError ? (
            <Alert
              variant="warning"
              title="Your answer was saved, but the next question could not be generated"
              action={
                <Button size="sm" variant="secondary" onClick={retryNext} loading={retryingNext}>
                  Generate next question
                </Button>
              }
            >
              {nextError.message}
            </Alert>
          ) : null}

          {openTurn && !abandoned ? (
            <>
              <QuestionCard turn={openTurn} number={mainNumber(openTurn)} total={interview.totalQuestions} />
              <SourceList sources={openTurn.sources} label="Question grounded in" />
              <section className="card stack" aria-label="Your answer">
                {submitError ? (
                  <Alert variant="error" title={isAiUnavailable(submitError) ? 'The AI model is not available' : 'Your answer was not evaluated'}>
                    {getErrorMessage(submitError)} Your answer is still here — try again.
                  </Alert>
                ) : null}
                <label htmlFor="answer" className="label">
                  Your answer
                </label>
                <textarea
                  id="answer"
                  ref={answerRef}
                  className="textarea"
                  rows={9}
                  maxLength={MAX_ANSWER}
                  value={answer}
                  disabled={submitting}
                  placeholder="Answer as you would out loud: state the idea, explain why, give an example."
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      submit();
                    }
                  }}
                />
                <div className="row-between">
                  <span className="xs muted">
                    {answer.length.toLocaleString()} / {MAX_ANSWER.toLocaleString()} characters. Ctrl+Enter to submit.
                  </span>
                  <Button onClick={submit} loading={submitting} disabled={!answer.trim()}>
                    {submitting ? 'Evaluating your answer…' : 'Submit answer'}
                  </Button>
                </div>
                {submitting ? (
                  <p className="small muted row" role="status">
                    <Spinner size={14} /> Scoring your answer and preparing the next question. Local models can take a minute.
                  </p>
                ) : null}
              </section>
            </>
          ) : null}

          {!openTurn && progress.finished && !abandoned ? (
            <section className="card stack" style={{ alignItems: 'flex-start' }}>
              <h2>All questions answered</h2>
              <p className="muted">Finish the interview to get your report, weak areas and a personalised study roadmap.</p>
              <Button size="lg" onClick={() => setConfirm('complete')}>
                Finish and get report
              </Button>
            </section>
          ) : null}

          {abandoned ? <Alert variant="info">This interview was abandoned. Start a new one from the dashboard.</Alert> : null}

          {answered.length ? (
            <section className="stack" aria-labelledby="transcript-heading">
              <h2 id="transcript-heading" className="section-title">Transcript</h2>
              {answered.map((t) => (
                <TranscriptItem key={t.index} turn={t} number={mainNumber(t)} />
              ))}
            </section>
          ) : null}
        </div>

        <aside className="card stack" aria-label="Interview progress">
          <div>
            <div className="row-between small" style={{ marginBottom: 8 }}>
              <strong>Progress</strong>
              <span className="muted">
                {Math.min(progress.mainAsked, interview.totalQuestions)} / {interview.totalQuestions}
              </span>
            </div>
            <ProgressBar value={answered.filter((t) => !t.isFollowUp).length} max={interview.totalQuestions} label="Main questions answered" />
          </div>
          <ul className="list">
            {interview.turns.map((t) => (
              <li key={t.index} className="list-row small" style={{ paddingLeft: t.isFollowUp ? 16 : 0 }}>
                <span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.isFollowUp ? 'Follow-up' : `Q${mainNumber(t)}`}: {t.topic || 'Question'}
                </span>
                {t.evaluation ? (
                  <Badge tone={scoreTone(t.evaluation.overallScore)}>{formatScore(t.evaluation.overallScore)}</Badge>
                ) : (
                  <Badge tone="info">Now</Badge>
                )}
              </li>
            ))}
          </ul>
          <p className="xs faint">Follow-ups appear when your answer leaves something worth probing (up to {interview.maxFollowUps}).</p>
        </aside>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm === 'abandon' ? 'Abandon this interview?' : 'Finish the interview?'}
        confirmLabel={confirm === 'abandon' ? 'Abandon interview' : finishing ? 'Writing your report…' : 'Finish and get report'}
        danger={confirm === 'abandon'}
        loading={finishing}
        onConfirm={finish}
        onCancel={() => setConfirm(null)}
      >
        {confirm === 'abandon'
          ? 'It will not count towards your stats and cannot be resumed.'
          : openTurn
            ? `The current question is unanswered and will be left out. The report covers your ${answered.length} answered question${answered.length === 1 ? '' : 's'}.`
            : 'PrepAI will write a summary of your performance and a study roadmap.'}
      </ConfirmDialog>
    </div>
  );
}
