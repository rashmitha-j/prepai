import Icon from './Icon';

const ICONS = { error: 'alert', warning: 'alert', success: 'check', info: 'info' };

export default function Alert({ variant = 'info', title, children, className = '', onDismiss, action }) {
  return (
    <div className={`alert alert-${variant} ${className}`} role={variant === 'error' ? 'alert' : undefined}>
      <Icon name={ICONS[variant]} size={16} />
      <div className="grow">
        {title ? <strong style={{ display: 'block', marginBottom: 2 }}>{title}</strong> : null}
        <div>{children}</div>
        {action ? <div style={{ marginTop: 8 }}>{action}</div> : null}
      </div>
      {onDismiss ? (
        <button type="button" className="btn btn-ghost btn-sm icon-btn" onClick={onDismiss} aria-label="Dismiss" style={{ minHeight: 24, width: 24 }}>
          <Icon name="x" size={14} />
        </button>
      ) : null}
    </div>
  );
}
