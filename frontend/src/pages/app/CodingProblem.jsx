import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { codingApi } from '../../api';
import CodeEditor from '../../components/CodeEditor';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import ErrorState from '../../components/ui/ErrorState';
import Icon from '../../components/ui/Icon';
import PageHeader from '../../components/ui/PageHeader';
import RichText from '../../components/ui/RichText';
import { SkeletonCards } from '../../components/ui/Skeleton';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { getErrorMessage } from '../../utils/errors';
import { DIFFICULTY_LABELS, formatDate, VERDICT_LABELS } from '../../utils/format';

const DIFF_TONE = { easy: 'good', medium: 'mid', hard: 'bad' };
const verdictTone = (v) => (v === 'accepted' ? 'good' : v === 'compile_error' || v === 'internal_error' ? 'mid' : 'bad');
const STATUS_LABEL = { passed: 'Passed', wrong_answer: 'Wrong answer', runtime_error: 'Runtime error', time_limit_exceeded: 'Time limit', output_limit_exceeded: 'Output limit', skipped: 'Not run' };

function TestResult({ r }) {
  const ok = r.status === 'passed';
  return (
    <div className="test-row">
      <Icon name={ok ? 'check' : r.status === 'skipped' ? 'info' : 'x'} size={16} />
      <span className="grow">
        Test {r.index + 1}
        {r.hidden ? <span className="muted"> (hidden)</span> : null}
      </span>
      <Badge tone={ok ? 'good' : r.status === 'skipped' ? 'neutral' : 'bad'}>{STATUS_LABEL[r.status] || r.status}</Badge>
      {r.timeMs !== null && r.timeMs !== undefined ? <span className="xs muted nowrap">{r.timeMs} ms</span> : null}
      {!r.hidden && !ok && r.status !== 'skipped' && r.input !== undefined ? (
        <details className="details" style={{ width: '100%' }}>
          <summary>Show input and output</summary>
          <div className="grid-3">
            <div>
              <span className="xs muted">Input</span>
              <pre className="io-block">{r.input}</pre>
            </div>
            <div>
              <span className="xs muted">Expected</span>
              <pre className="io-block">{r.expectedOutput}</pre>
            </div>
            <div>
              <span className="xs muted">Your output</span>
              <pre className="io-block">{r.actualOutput || '(empty)'}</pre>
            </div>
          </div>
          {r.stderr ? <pre className="io-block" style={{ marginTop: 8 }}>{r.stderr}</pre> : null}
        </details>
      ) : null}
    </div>
  );
}

export default function CodingProblem() {
  const { id: slug } = useParams();
  const { data: problem, error, loading, reload } = useAsync(() => codingApi.problem(slug).then((r) => r.problem), [slug]);
  useDocumentTitle(problem?.title || 'Coding problem');

  const back = { to: '/coding', label: 'Coding practice' };
  if (loading && !problem) return <><PageHeader title="Problem" back={back} /><SkeletonCards count={2} height={240} /></>;
  if (error) return <><PageHeader title="Problem" back={back} /><ErrorState error={error} onRetry={reload} /></>;
  // Keyed by slug so editor state resets cleanly when navigating between problems.
  return <Workspace key={problem.slug} problem={problem} back={back} />;
}

function loadDraft(key, fallback) {
  try {
    return window.localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function Workspace({ problem, back }) {
  const slug = problem.slug;
  const history = useAsync(() => codingApi.submissions(slug).then((r) => r.submissions), [slug]);
  const draftKey = `prepai.code.${slug}`;
  const [code, setCode] = useState(() => loadDraft(draftKey, problem.starterCode.cpp));
  const [running, setRunning] = useState(null); // 'run' | 'submit'
  const [result, setResult] = useState(null);
  const [runError, setRunError] = useState('');
  const [explanation, setExplanation] = useState(null);
  const [explaining, setExplaining] = useState(false);
  const [explainError, setExplainError] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (!code) return;
    try {
      if (code === problem.starterCode.cpp) window.localStorage.removeItem(draftKey);
      else window.localStorage.setItem(draftKey, code);
    } catch {
      /* ignore */
    }
  }, [code, problem, draftKey]);

  const execute = async (mode) => {
    setRunning(mode);
    setRunError('');
    setExplanation(null);
    setExplainError('');
    try {
      const { result: r } = await codingApi.submit(slug, code, mode);
      setResult(r);
      if (mode === 'submit') history.reload();
    } catch (err) {
      setRunError(getErrorMessage(err));
    } finally {
      setRunning(null);
    }
  };

  const explain = async () => {
    setExplaining(true);
    setExplainError('');
    try {
      const { explanation: e } = await codingApi.explain(result.submissionId);
      setExplanation(e);
    } catch (err) {
      setExplainError(getErrorMessage(err));
    } finally {
      setExplaining(false);
    }
  };

  return (
    <div className="stack-lg">
      <PageHeader
        back={back}
        title={problem.title}
        actions={
          <>
            <Badge tone={DIFF_TONE[problem.difficulty]}>{DIFFICULTY_LABELS[problem.difficulty]}</Badge>
            {problem.topics?.map((t) => (
              <Badge key={t}>{t}</Badge>
            ))}
          </>
        }
      />
      <div className="coding-layout">
        <section className="card stack" aria-label="Problem statement">
          <RichText text={problem.description} className="problem-text" />
          {problem.inputFormat ? (
            <div>
              <h3 className="small" style={{ marginBottom: 4 }}>Input</h3>
              <p className="small" style={{ whiteSpace: 'pre-line' }}>{problem.inputFormat}</p>
            </div>
          ) : null}
          {problem.outputFormat ? (
            <div>
              <h3 className="small" style={{ marginBottom: 4 }}>Output</h3>
              <RichText text={problem.outputFormat} className="small" />
            </div>
          ) : null}
          {problem.constraints?.length ? (
            <div>
              <h3 className="small" style={{ marginBottom: 4 }}>Constraints</h3>
              <ul className="bullets small">
                {problem.constraints.map((c) => (
                  <li key={c}>
                    <code>{c}</code>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {problem.examples?.map((ex, i) => (
            <div key={i} className="stack-sm">
              <h3 className="small">Example {i + 1}</h3>
              <div className="grid-2">
                <div>
                  <span className="xs muted">Input</span>
                  <pre className="io-block">{ex.input}</pre>
                </div>
                <div>
                  <span className="xs muted">Output</span>
                  <pre className="io-block">{ex.output}</pre>
                </div>
              </div>
              {ex.explanation ? <p className="xs muted">{ex.explanation}</p> : null}
            </div>
          ))}
          <p className="xs faint">
            {problem.totalTests} test cases ({problem.sampleTests.length} visible). Time limit {problem.timeLimitMs / 1000}s, memory {problem.memoryLimitMb} MB.
          </p>
        </section>

        <div className="stack">
          <div className="row-between">
            <span className="small muted">C++17 (g++ -O2). Read from stdin, write to stdout.</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmReset(true)}>
              <Icon name="refresh" size={14} /> Reset code
            </button>
          </div>
          <CodeEditor value={code} onChange={setCode} label={`C++ solution for ${problem.title}`} disabled={Boolean(running)} />
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => execute('run')} loading={running === 'run'} disabled={Boolean(running) || !code.trim()}>
              <Icon name="play" size={14} /> Run samples
            </Button>
            <Button onClick={() => execute('submit')} loading={running === 'submit'} disabled={Boolean(running) || !code.trim()}>
              Submit
            </Button>
          </div>

          {runError ? <Alert variant="error" title="Could not run your code">{runError}</Alert> : null}

          {result ? (
            <section className="card stack" aria-live="polite" aria-label="Results">
              <div className="row-between">
                <div className="row">
                  <Badge tone={verdictTone(result.verdict)}>{VERDICT_LABELS[result.verdict]}</Badge>
                  <span className="small">
                    {result.passedCount} / {result.totalCount} tests passed
                    {result.mode === 'run' ? ' (samples only)' : ''}
                  </span>
                </div>
                {result.runtimeMs !== null && result.runtimeMs !== undefined ? <span className="xs muted">Slowest test: {result.runtimeMs} ms</span> : null}
              </div>
              {result.verdict === 'compile_error' ? <pre className="io-block" style={{ maxHeight: 300 }}>{result.compileOutput}</pre> : null}
              {result.results?.length ? (
                <div>
                  {result.results.map((r) => (
                    <TestResult key={r.index} r={r} />
                  ))}
                </div>
              ) : null}
              <p className="xs faint">Sandbox: {result.sandbox}</p>
              {result.mode === 'submit' && result.submissionId ? (
                <div className="stack-sm">
                  <Button variant="secondary" onClick={explain} loading={explaining} disabled={Boolean(explanation)}>
                    <Icon name="spark" size={14} />
                    {result.verdict === 'accepted' ? 'Review complexity with AI' : 'Explain what went wrong'}
                  </Button>
                  {explainError ? <Alert variant="error">{explainError}</Alert> : null}
                </div>
              ) : null}
              {explanation ? (
                <div className="card card-tight stack-sm" style={{ background: 'var(--surface-sunken)', border: 0 }}>
                  <p className="small">{explanation.summary}</p>
                  {explanation.likelyIssues?.length ? (
                    <div>
                      <h4 className="small" style={{ marginBottom: 4 }}>Likely issues</h4>
                      <ul className="bullets small">
                        {explanation.likelyIssues.map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <div className="row small">
                    {explanation.timeComplexity ? <span>Time: <code>{explanation.timeComplexity}</code></span> : null}
                    {explanation.spaceComplexity ? <span>Space: <code>{explanation.spaceComplexity}</code></span> : null}
                  </div>
                  {explanation.improvements?.length ? (
                    <div>
                      <h4 className="small" style={{ marginBottom: 4 }}>Improvements</h4>
                      <ul className="bullets small">
                        {explanation.improvements.map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <span className="xs faint">AI explanation. The test results above are the source of truth.</span>
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="card card-tight" aria-labelledby="subs-heading">
            <h2 id="subs-heading" className="section-title">Your submissions</h2>
            {history.data?.length ? (
              <ul className="list">
                {history.data.map((s) => (
                  <li key={s._id} className="list-row small">
                    <Badge tone={verdictTone(s.verdict)}>{VERDICT_LABELS[s.verdict]}</Badge>
                    <span className="grow muted">
                      {s.passedCount}/{s.totalCount} tests
                    </span>
                    <span className="xs muted">{formatDate(s.createdAt, true)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small faint">No submissions yet.</p>
            )}
          </section>
        </div>
      </div>
      <ConfirmDialog
        open={confirmReset}
        title="Reset to the starter code?"
        confirmLabel="Reset code"
        danger
        onConfirm={() => {
          setCode(problem.starterCode.cpp);
          setConfirmReset(false);
        }}
        onCancel={() => setConfirmReset(false)}
      >
        Your current code for this problem will be replaced.
      </ConfirmDialog>
    </div>
  );
}
