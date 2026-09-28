export default function Spinner({ size = 18, label }) {
  return (
    <span className="spinner" style={{ width: size, height: size }} role={label ? 'status' : undefined} aria-label={label}>
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}

export function PageLoading({ label = 'Loading…' }) {
  return (
    <div className="page-loading" role="status">
      <Spinner size={24} />
      <span className="small">{label}</span>
    </div>
  );
}
