export default function Badge({ tone = 'neutral', children, title }) {
  const cls = tone === 'neutral' ? 'badge' : `badge badge-${tone}`;
  return (
    <span className={cls} title={title}>
      {children}
    </span>
  );
}
