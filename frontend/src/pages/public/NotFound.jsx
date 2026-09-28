import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

export default function NotFound() {
  useDocumentTitle('Page not found');
  return (
    <div style={{ padding: '64px 0' }}>
      <EmptyState icon="search" title="Page not found" action={<Button to="/">Go to the home page</Button>}>
        The page you are looking for does not exist or has moved.
      </EmptyState>
    </div>
  );
}
