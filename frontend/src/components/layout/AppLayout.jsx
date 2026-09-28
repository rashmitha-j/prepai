import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { initials } from '../../utils/format';
import Icon from '../ui/Icon';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { to: '/interview/new', label: 'New interview', icon: 'interview' },
  { to: '/interviews', label: 'Interview history', icon: 'history' },
  { to: '/resumes', label: 'Resumes', icon: 'resume' },
  { to: '/jobs', label: 'Job descriptions', icon: 'job' },
  { to: '/coding', label: 'Coding practice', icon: 'code' },
  { to: '/knowledge', label: 'Knowledge base', icon: 'book' },
];

export function Brand({ to = '/' }) {
  return (
    <Link to={to} className="brand" aria-label="PrepAI home">
      <span className="brand-mark" aria-hidden="true">P</span>
      PrepAI
    </Link>
  );
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="app-shell">
      <div className="topbar">
        <Brand to="/dashboard" />
        <button type="button" className="btn btn-ghost icon-btn" onClick={() => setOpen(true)} aria-label="Open navigation" aria-expanded={open}>
          <Icon name="menu" size={22} />
        </button>
      </div>
      {open ? <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" /> : null}
      <aside className={`sidebar${open ? ' open' : ''}`} aria-label="Main navigation">
        <div className="row-between">
          <Brand to="/dashboard" />
          {open ? (
            <button type="button" className="btn btn-ghost icon-btn" onClick={() => setOpen(false)} aria-label="Close navigation" style={{ marginBottom: 12 }}>
              <Icon name="close" />
            </button>
          ) : null}
        </div>
        <nav className="nav">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/interview/new'} onClick={() => setOpen(false)} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <Icon name={item.icon} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <Link to="/profile" className="row grow" style={{ color: 'inherit', gap: 8, minWidth: 0, flexWrap: 'nowrap' }} onClick={() => setOpen(false)}>
            <span className="avatar">{initials(user?.name)}</span>
            <span className="grow" style={{ minWidth: 0 }}>
              <span className="small" style={{ display: 'block', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.name}
              </span>
              <span className="xs muted" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.email}
              </span>
            </span>
          </Link>
          <button
            type="button"
            className="btn btn-ghost icon-btn"
            onClick={() => {
              logout();
              navigate('/login');
            }}
            aria-label="Log out"
            title="Log out"
          >
            <Icon name="logout" />
          </button>
        </div>
      </aside>
      <main className="main" id="main">
        <div className="container">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
