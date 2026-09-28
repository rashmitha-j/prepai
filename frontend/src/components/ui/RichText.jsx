/**
 * Renders trusted-format plain text with `inline code` and **bold** — without
 * dangerouslySetInnerHTML, so user/AI content can never inject HTML.
 */
function renderInline(text, keyPrefix) {
  const parts = String(text).split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={key}>{part.slice(1, -1)}</code>;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={key}>{part.slice(2, -2)}</strong>;
    return part;
  });
}

export default function RichText({ text, className }) {
  if (!text) return null;
  const paragraphs = String(text).split(/\n{2,}/);
  return (
    <div className={className}>
      {paragraphs.map((p, i) => (
        <p key={i} style={{ whiteSpace: 'pre-line' }}>
          {renderInline(p, i)}
        </p>
      ))}
    </div>
  );
}
