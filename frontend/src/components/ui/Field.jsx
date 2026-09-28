import { useId } from 'react';

/** Labelled form control with hint and error text wired up for screen readers. */
export default function Field({ label, hint, error, as = 'input', className = '', ...props }) {
  const id = useId();
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  const Control = as;
  const controlClass = as === 'textarea' ? 'textarea' : as === 'select' ? 'select' : 'input';
  return (
    <div className={`field ${className}`}>
      {label ? <label htmlFor={id}>{label}</label> : null}
      <Control id={id} className={controlClass} aria-invalid={error ? 'true' : undefined} aria-describedby={describedBy} {...props} />
      {hint && !error ? (
        <span id={`${id}-hint`} className="hint">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={`${id}-error`} className="field-error">
          {error}
        </span>
      ) : null}
    </div>
  );
}
