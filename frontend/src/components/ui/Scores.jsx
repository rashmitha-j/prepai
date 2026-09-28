import { formatScore, scoreColor, SCORE_LABELS } from '../../utils/format';

export function ScoreBar({ label, value, max = 10 }) {
  const pct = value === null || value === undefined ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="score-bar">
      <span className="muted">{label}</span>
      <div className="score-track" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value ?? 0} aria-label={label}>
        <div className="score-fill" style={{ width: `${pct}%`, background: scoreColor(value) }} />
      </div>
      <span className="score-num">{formatScore(value)}</span>
    </div>
  );
}

export function RubricBars({ scores = {} }) {
  return (
    <div className="stack-sm">
      {Object.entries(SCORE_LABELS).map(([key, label]) =>
        scores[key] !== undefined ? <ScoreBar key={key} label={label} value={scores[key]} /> : null,
      )}
    </div>
  );
}

export function ScoreRing({ value, size = 72, label = 'Score out of 10' }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = value === null || value === undefined ? 0 : Math.max(0, Math.min(1, value / 10));
  return (
    <div className="score-ring" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${formatScore(value)}`}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="var(--surface-sunken)" strokeWidth="6" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={scoreColor(value)}
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct)}
        />
      </svg>
      <span style={{ fontSize: size < 60 ? 'var(--text-sm)' : undefined }}>{formatScore(value)}</span>
    </div>
  );
}

export function ProgressBar({ value, max, label }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
      <div style={{ width: `${pct}%` }} />
    </div>
  );
}
