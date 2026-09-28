export default function StatCard({ label, value, hint }) {
  return (
    <div className="card card-tight stat-card">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {hint ? <span className="xs faint">{hint}</span> : null}
    </div>
  );
}
