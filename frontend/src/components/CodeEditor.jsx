import { useMemo, useRef } from 'react';

/**
 * Lightweight code editor: monospace textarea with line numbers, Tab indentation and
 * auto-indent on Enter. Kept dependency-free to keep the bundle small.
 */
export default function CodeEditor({ value, onChange, label = 'Code editor', disabled }) {
  const gutter = useRef(null);
  const lines = useMemo(() => Math.max(1, value.split('\n').length), [value]);

  const insert = (el, text, cursorOffset = text.length) => {
    const { selectionStart: start, selectionEnd: end } = el;
    const next = value.slice(0, start) + text + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + cursorOffset;
    });
  };

  const onKeyDown = (e) => {
    const el = e.currentTarget;
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      insert(el, '    ');
    } else if (e.key === 'Enter') {
      const lineStart = value.lastIndexOf('\n', el.selectionStart - 1) + 1;
      const indent = value.slice(lineStart, el.selectionStart).match(/^\s*/)[0];
      const extra = value[el.selectionStart - 1] === '{' ? '    ' : '';
      e.preventDefault();
      insert(el, `\n${indent}${extra}`);
    }
  };

  return (
    <div className="editor">
      <div className="editor-gutter" ref={gutter} aria-hidden="true">
        {Array.from({ length: lines }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <textarea
        aria-label={label}
        value={value}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onScroll={(e) => {
          if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop;
        }}
        rows={Math.min(Math.max(lines + 2, 18), 40)}
      />
    </div>
  );
}
