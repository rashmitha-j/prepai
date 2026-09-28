import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import RichText from '../components/ui/RichText';
import { RubricBars } from '../components/ui/Scores';
import { AuthProvider } from '../context/AuthContext';
import { ToastProvider } from '../context/ToastContext';
import { ProtectedRoute } from '../components/layout/RouteGuards';
import Register from '../pages/public/Register';

vi.mock('../api', () => ({
  authApi: { me: vi.fn(), register: vi.fn(), login: vi.fn() },
}));

describe('RichText', () => {
  it('renders code and bold without injecting HTML', () => {
    const { container } = render(<RichText text={'Use `map` and **not** <img src=x onerror=alert(1)>'} />);
    expect(container.querySelector('code').textContent).toBe('map');
    expect(container.querySelector('strong').textContent).toBe('not');
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});

describe('RubricBars', () => {
  it('renders one accessible meter per rubric dimension', () => {
    render(<RubricBars scores={{ correctness: 8, clarity: 4 }} />);
    expect(screen.getByRole('meter', { name: 'Correctness' })).toHaveAttribute('aria-valuenow', '8');
    expect(screen.getAllByRole('meter')).toHaveLength(2);
  });
});

function renderWithProviders(ui, { route = '/' } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <ToastProvider>{ui}</ToastProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute', () => {
  it('redirects anonymous users to login', () => {
    renderWithProviders(
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<p>secret dashboard</p>} />
        </Route>
        <Route path="/login" element={<p>login page</p>} />
      </Routes>,
      { route: '/dashboard' },
    );
    expect(screen.getByText('login page')).toBeInTheDocument();
    expect(screen.queryByText('secret dashboard')).toBeNull();
  });
});

describe('Register form', () => {
  it('validates fields before calling the API', async () => {
    const { authApi } = await import('../api');
    renderWithProviders(<Register />);
    await userEvent.type(screen.getByLabelText('Name'), 'A');
    await userEvent.type(screen.getByLabelText('Email'), 'not-an-email');
    await userEvent.type(screen.getByLabelText('Password'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText(/at least 2 characters/)).toBeInTheDocument();
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByText('Use at least 8 characters.')).toBeInTheDocument();
    expect(authApi.register).not.toHaveBeenCalled();
  });
});
