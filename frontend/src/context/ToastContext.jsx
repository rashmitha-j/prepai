import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import Alert from '../components/ui/Alert';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const show = useCallback(
    (message, variant = 'success', timeout = 4000) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-3), { id, message, variant }]);
      if (timeout) setTimeout(() => dismiss(id), timeout);
    },
    [dismiss],
  );

  const api = useMemo(
    () => ({
      success: (m) => show(m, 'success'),
      error: (m) => show(m, 'error', 6000),
      info: (m) => show(m, 'info'),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toasts.map((t) => (
          <Alert key={t.id} variant={t.variant} className="toast" onDismiss={() => dismiss(t.id)}>
            {t.message}
          </Alert>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
