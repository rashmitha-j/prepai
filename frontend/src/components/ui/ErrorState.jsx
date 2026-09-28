import Alert from './Alert';
import Button from './Button';
import { getErrorMessage } from '../../utils/errors';

export default function ErrorState({ error, onRetry, title = 'Could not load this page' }) {
  return (
    <Alert
      variant="error"
      title={title}
      action={
        onRetry ? (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        ) : null
      }
    >
      {getErrorMessage(error)}
    </Alert>
  );
}
