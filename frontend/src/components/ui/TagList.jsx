export default function TagList({ items = [], tone, empty = 'None found', max }) {
  if (!items?.length) return <p className="faint small">{empty}</p>;
  const shown = max ? items.slice(0, max) : items;
  return (
    <div className="tags">
      {shown.map((item) => (
        <span key={item} className={tone ? `tag tag-${tone}` : 'tag'}>
          {item}
        </span>
      ))}
      {max && items.length > max ? <span className="tag">+{items.length - max} more</span> : null}
    </div>
  );
}
