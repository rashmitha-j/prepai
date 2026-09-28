import { useEffect } from 'react';

export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} | PrepAI` : 'PrepAI — AI Interview Coach';
  }, [title]);
}
