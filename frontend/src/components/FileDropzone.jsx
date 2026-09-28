import { useRef, useState } from 'react';
import Icon from './ui/Icon';

const MAX_MB = 5;

/** Drag-and-drop PDF picker with client-side checks (the server re-validates everything). */
export default function FileDropzone({ onFile, disabled }) {
  const input = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');

  const accept = (file) => {
    setError('');
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) return setError('Please choose a PDF file.');
    if (file.size > MAX_MB * 1024 * 1024) return setError(`The file is larger than ${MAX_MB} MB.`);
    onFile(file);
  };

  return (
    <div className="stack-sm">
      <div
        className={`dropzone${dragging ? ' dragging' : ''}`}
        role="button"
        tabIndex={0}
        aria-disabled={disabled || undefined}
        onClick={() => !disabled && input.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
            e.preventDefault();
            input.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) accept(e.dataTransfer.files?.[0]);
        }}
      >
        <input
          ref={input}
          type="file"
          accept="application/pdf,.pdf"
          onChange={(e) => {
            accept(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <div className="stack-sm" style={{ alignItems: 'center' }}>
          <Icon name="upload" size={28} className="faint" />
          <strong>Drop your resume here, or click to choose a file</strong>
          <span className="small muted">Text-based PDF, up to {MAX_MB} MB</span>
        </div>
      </div>
      {error ? <span className="field-error">{error}</span> : null}
    </div>
  );
}
