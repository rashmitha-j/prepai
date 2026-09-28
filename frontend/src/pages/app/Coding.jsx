import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { codingApi } from '../../api';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Icon from '../../components/ui/Icon';
import PageHeader from '../../components/ui/PageHeader';
import { ProgressBar } from '../../components/ui/Scores';
import { SkeletonCards } from '../../components/ui/Skeleton';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { DIFFICULTY_LABELS } from '../../utils/format';

const DIFF_TONE = { easy: 'good', medium: 'mid', hard: 'bad' };
const STATUS = { solved: ['good', 'Solved'], attempted: ['mid', 'Attempted'], todo: ['neutral', 'Not started'] };

export default function Coding() {
  useDocumentTitle('Coding practice');
  const { data, error, loading, reload } = useAsync(() => codingApi.problems().then((r) => r.problems), []);
  const [difficulty, setDifficulty] = useState('');

  const filtered = useMemo(() => (data || []).filter((p) => !difficulty || p.difficulty === difficulty), [data, difficulty]);
  const solved = (data || []).filter((p) => p.status === 'solved').length;

  return (
    <div className="stack-lg">
      <PageHeader
        title="Coding practice"
        description="Solve classic interview problems in C++. Your code is compiled and run against sample and hidden test cases in a sandbox."
      />

      {data?.length ? (
        <div className="card card-tight stack-sm">
          <div className="row-between small">
            <span>
              <strong>{solved}</strong> of {data.length} solved
            </span>
            <div className="segmented" role="radiogroup" aria-label="Filter by difficulty">
              {['', 'easy', 'medium', 'hard'].map((d) => (
                <label key={d || 'all'}>
                  <input type="radio" name="difficulty" checked={difficulty === d} onChange={() => setDifficulty(d)} />
                  {d ? DIFFICULTY_LABELS[d] : 'All'}
                </label>
              ))}
            </div>
          </div>
          <ProgressBar value={solved} max={data.length} label="Problems solved" />
        </div>
      ) : null}

      {loading && !data ? (
        <SkeletonCards count={5} height={60} />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data.length ? (
        <EmptyState icon="code" title="No problems available">
          Problems are added by the development seed. Run <code>npm run seed</code> in the project root.
        </EmptyState>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <ul className="list">
            {filtered.map((p) => (
              <li key={p.slug} className="list-row" style={{ padding: '14px 20px' }}>
                <Icon name={p.status === 'solved' ? 'check' : 'code'} className={p.status === 'solved' ? '' : 'faint'} />
                <div className="grow">
                  <Link to={`/coding/${p.slug}`} style={{ color: 'var(--ink)', fontWeight: 500 }}>
                    {p.title}
                  </Link>
                  <div className="xs muted">{p.topics?.join(', ')}</div>
                </div>
                <Badge tone={STATUS[p.status][0]}>{STATUS[p.status][1]}</Badge>
                <Badge tone={DIFF_TONE[p.difficulty]}>{DIFFICULTY_LABELS[p.difficulty]}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
