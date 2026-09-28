import Icon from './ui/Icon';

/** Knowledge-base chunks retrieved by RAG for a question, evaluation or report. */
export default function SourceList({ sources = [], label = 'Grounded in' }) {
  if (!sources?.length) return null;
  const unique = [];
  const seen = new Set();
  for (const s of sources) {
    const key = `${s.title}|${s.section}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(s);
    }
  }
  return (
    <div className="sources">
      <span className="xs faint">{label}</span>
      {unique.slice(0, 4).map((s) => (
        <span key={`${s.title}|${s.section}`} className="source-chip" title={s.score !== undefined ? `Similarity ${Number(s.score).toFixed(2)}` : undefined}>
          <Icon name="book" size={12} />
          {s.section ? s.section.split(' > ').slice(-1)[0] : s.title}
        </span>
      ))}
    </div>
  );
}
