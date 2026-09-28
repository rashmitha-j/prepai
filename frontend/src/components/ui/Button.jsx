import { Link } from 'react-router-dom';
import Spinner from './Spinner';

/** Button or link styled as a button. `loading` disables it and shows a spinner. */
export default function Button({
  variant = 'primary',
  size,
  block,
  loading,
  disabled,
  to,
  className = '',
  children,
  type = 'button',
  ...rest
}) {
  const classes = ['btn', `btn-${variant}`, size && `btn-${size}`, block && 'btn-block', className].filter(Boolean).join(' ');
  if (to) {
    return (
      <Link to={to} className={classes} {...rest}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner size={16} /> : null}
      {children}
    </button>
  );
}
