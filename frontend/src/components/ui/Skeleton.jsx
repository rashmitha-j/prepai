export default function Skeleton({ height = 16, width = '100%', radius, style }) {
  return <div className="skeleton" style={{ height, width, borderRadius: radius, ...style }} aria-hidden="true" />;
}

export function SkeletonCards({ count = 3, height = 96 }) {
  return (
    <div className="stack" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} height={height} radius="var(--r-md)" />
      ))}
    </div>
  );
}
