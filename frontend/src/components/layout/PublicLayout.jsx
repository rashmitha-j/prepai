import { Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Button from '../ui/Button';
import { Brand } from './AppLayout';

export default function PublicLayout() {
  const { isAuthenticated } = useAuth();
  return (
    <div>
      <header className="public-header">
        <Brand />
        <nav className="public-nav" aria-label="Site">
          <Button variant="ghost" to="/about">
            About
          </Button>
          {isAuthenticated ? (
            <Button to="/dashboard">Open dashboard</Button>
          ) : (
            <>
              <Button variant="ghost" to="/login">
                Log in
              </Button>
              <Button to="/register">Sign up</Button>
            </>
          )}
        </nav>
      </header>
      <main className="public-main">
        <Outlet />
      </main>
      <footer className="public-footer">PrepAI helps you practise. It does not make hiring decisions, and AI feedback can be wrong.</footer>
    </div>
  );
}
